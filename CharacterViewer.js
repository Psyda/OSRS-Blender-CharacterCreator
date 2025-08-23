/**
 * CharacterViewer.js
 * Updated for standalone cache file loading - preserving exact original logic
 * This file contains the Three.js logic for rendering the RuneScape character
 * and its equipment using individual cache files.
 */

// This global variable will be accessed from the main HTML file to set the wireframe status
let wireframeMode = false;

// WearPos mapping to determine which character parts an item should hide
const WEAR_POS = {
    0: "Head", 1: "Cape", 2: "Amulet", 3: "Weapon", 4: "Torso", 5: "Shield",
    6: "Arms", 7: "Legs", 8: "Hair", 9: "Hands", 10: "Boots", 11: "Jaw", 12: "Ring", 13: "Ammo"
};

// RuneScape color conversion functions (ported from Blender plugin)
const BRIGHTNESS_MAX = 0.6;
const HUE_OFFSET = 0.5 / 64;
const SATURATION_OFFSET = 0.5 / 8;

function unpackHue(hsl) {
    return (hsl >> 10) & 63;
}

function unpackSaturation(hsl) {
    return (hsl >> 7) & 7;
}

function unpackLuminance(hsl) {
    return hsl & 127;
}

/**
 * Converts a standard hex color string to the game's specific HSL integer format.
 * This function is the mathematical inverse of the provided jagexHslToRgb function.
 */
function hexToJagexHsl(hex, brightness = BRIGHTNESS_MAX) {
    // Step 1: Convert hex to normalized RGB (0.0 to 1.0)
    let r = parseInt(hex.slice(1, 3), 16) / 255.0;
    let g = parseInt(hex.slice(3, 5), 16) / 255.0;
    let b = parseInt(hex.slice(5, 7), 16) / 255.0;

    // Step 2: Invert the game's brightness adjustment.
    r = Math.pow(r, 1.0 / brightness);
    g = Math.pow(g, 1.0 / brightness);
    b = Math.pow(b, 1.0 / brightness);

    // Step 3: Convert the brightness-adjusted RGB to standard HSL.
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sum = max + min;
    const delta = max - min;

    const l = sum / 2.0;
    let h = 0;
    let s = 0;

    if (delta > 0.0001) { // Check for grayscale
        s = l > 0.5 ? delta / (2.0 - sum) : delta / sum;
        switch (max) {
            case r: h = ((g - b) / delta + (g < b ? 6.0 : 0.0)) / 6.0; break;
            case g: h = ((b - r) / delta + 2.0) / 6.0; break;
            case b: h = ((r - g) / delta + 4.0) / 6.0; break;
        }
    }

    // Step 4: Scale to Jagex's ranges, inverting the offsets.
    const rsHue = Math.floor((h - HUE_OFFSET) * 64.0) & 63;
    const rsSaturation = Math.floor((s - SATURATION_OFFSET) * 8.0) & 7;
    const rsLuminance = Math.floor(l * 127.0) & 127;

    // Step 5: Pack the values into a single integer.
    return (rsHue << 10) | (rsSaturation << 7) | rsLuminance;
}

function adjustForBrightness(rgb, brightness) {
    let r = ((rgb >> 16) & 255) / 256.0;
    let g = ((rgb >> 8) & 255) / 256.0;
    let b = (rgb & 255) / 256.0;

    r = Math.pow(r, brightness);
    g = Math.pow(g, brightness);
    b = Math.pow(b, brightness);

    return (Math.floor(r * 256.0) << 16) | (Math.floor(g * 256.0) << 8) | Math.floor(b * 256.0);
}

function jagexHslToRgb(hslValue, brightness = BRIGHTNESS_MAX) {
    const hue = unpackHue(hslValue) / 64.0 + HUE_OFFSET;
    const saturation = unpackSaturation(hslValue) / 8.0 + SATURATION_OFFSET;
    const luminance = unpackLuminance(hslValue) / 128.0;

    const chroma = (1 - Math.abs(2 * luminance - 1)) * saturation;
    const x = chroma * (1 - Math.abs(((hue * 6) % 2) - 1));
    const lightness = luminance - chroma / 2;

    let r = lightness, g = lightness, b = lightness;

    const hueSector = Math.floor(hue * 6);
    if (hueSector === 0) { r += chroma; g += x; }
    else if (hueSector === 1) { g += chroma; r += x; }
    else if (hueSector === 2) { g += chroma; b += x; }
    else if (hueSector === 3) { b += chroma; g += x; }
    else if (hueSector === 4) { b += chroma; r += x; }
    else { r += chroma; b += x; }

    let rgb = (Math.floor(r * 256.0) << 16) | (Math.floor(g * 256.0) << 8) | Math.floor(b * 256.0);
    rgb = adjustForBrightness(rgb, brightness);

    if (rgb === 0) rgb = 1;
    return rgb;
}

function rgbIntToFloatArray(rgbInt) {
    const r = ((rgbInt >> 16) & 255) / 255.0;
    const g = ((rgbInt >> 8) & 255) / 255.0;
    const b = (rgbInt & 255) / 255.0;
    return [r, g, b];
}

function applyColorOverrides(faceColors, colorOverrides) {
    if (!colorOverrides) return faceColors;
    const overriddenColors = [];
    for (const color of faceColors) {
        overriddenColors.push(colorOverrides[color.toString()] || color);
    }
    return overriddenColors;
}

/**
 * Filters out vertices in group 0 or "root" group and updates face indices accordingly
 * @param {Array} vertices - Array of [x, y, z] vertex positions
 * @param {Array} faces - Array of [v1, v2, v3] face indices
 * @param {Array} vertexGroups - Array of vertex group assignments
 * @param {Array} faceColors - Optional array of face colors
 * @returns {Object} Filtered vertex and face data
 */
function filterRootVertices(vertices, faces, vertexGroups, faceColors = null) {
    if (!vertexGroups || vertexGroups.length === 0) {
        // No vertex groups available, return original data
        return {
            vertices: vertices,
            faces: faces,
            faceColors: faceColors,
            vertexIndexMap: null
        };
    }

    // Create array to track which vertices to keep (not in group 0)
    const keepVertex = new Array(vertices.length);
    const vertexIndexMap = new Array(vertices.length); // Maps old index to new index
    let newVertexIndex = 0;

    // Mark vertices to keep and build index mapping
    for (let i = 0; i < vertices.length; i++) {
        const group = vertexGroups[i];
        // Keep vertex if it's not in group 0 (assuming group 0 is "root")
        if (group !== 0) {
            keepVertex[i] = true;
            vertexIndexMap[i] = newVertexIndex++;
        } else {
            keepVertex[i] = false;
            vertexIndexMap[i] = -1; // Mark as removed
        }
    }

    // If no vertices were filtered, return original data
    if (newVertexIndex === vertices.length) {
        return {
            vertices: vertices,
            faces: faces,
            faceColors: faceColors,
            vertexIndexMap: null
        };
    }

    // Filter vertices
    const filteredVertices = [];
    for (let i = 0; i < vertices.length; i++) {
        if (keepVertex[i]) {
            filteredVertices.push(vertices[i]);
        }
    }

    // Filter faces and update indices
    const filteredFaces = [];
    const filteredFaceColors = faceColors ? [] : null;
    
    for (let i = 0; i < faces.length; i++) {
        const face = faces[i];
        const [v1, v2, v3] = face;
        
        // Check if all vertices in this face are kept
        if (keepVertex[v1] && keepVertex[v2] && keepVertex[v3]) {
            // Update face indices to new vertex positions
            filteredFaces.push([
                vertexIndexMap[v1],
                vertexIndexMap[v2],
                vertexIndexMap[v3]
            ]);
            
            // Keep corresponding face color if available
            if (filteredFaceColors && faceColors && i < faceColors.length) {
                filteredFaceColors.push(faceColors[i]);
            }
        }
        // Skip faces that reference removed vertices
    }

    console.log(`Filtered ${vertices.length - filteredVertices.length} root vertices, ${faces.length - filteredFaces.length} faces removed`);

    return {
        vertices: filteredVertices,
        faces: filteredFaces,
        faceColors: filteredFaceColors,
        vertexIndexMap: vertexIndexMap
    };
}

class CharacterViewer {
    constructor(container, dataPath = './cache/') {
        this.container = container;
        this.dataPath = dataPath;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.characterModel = null; // THREE.Group for all character meshes
        
        this.itemMeshes = new Map();
        this.kitMeshes = new Map();
        
        this.equippedItems = new Map();
        this.equippedKits = new Map();
        this.kitLookup = null;
        this.gender = 'male';
        
        // Player-defined color properties
        this.playerColorMappings = {
            skin: 4550,
            hairMain: 6798,
            hairSecond: 55232,
            shirt: 8741,
            pants: 25238,
            boots: 4626
        };
        this.defaultPlayerColorsHex = {
            skin: '#d6ac87',
            hairMain: '#5c4920',
            hairSecond: '#75572F',
            shirt: '#9e8f49',
            pants: '#2a7948',
            boots: '#54352A'
        };
        this.playerColors = {}; // Stores current HSL values by type
        this.playerColorOverrides = {}; // Stores { rs_color_id: hsl_value } for mesh creation

        // File cache for loaded data
        this.fileCache = new Map();

        this.defaultKits = {
            male: { Hair: 0, Jaw: 10, Torso: 18, Arms: 26, Legs: 36, Hands: 33, Boots: 42 },
            female: { Hair: 45, Jaw: 51, Torso: 57, Arms: 61, Legs: 70, Hands: 68, Boots: 77 }
        };

        // Tooltip system
        this.raycaster = null;
        this.mouse = new THREE.Vector2();
        this.tooltip = null;
        this.hoveredObject = null;
        
        this.isBusy = false; // Simple lock to prevent race conditions

        this.init();
        this.initializePlayerColors();
    }

    // === FILE LOADING METHODS ===
    
    decodeData(encodedData) {
        try {
            // Check if data is base64 encoded
            if (typeof encodedData === 'string' && !encodedData.startsWith('{')) {
                const decoded = atob(encodedData);
                return JSON.parse(decoded);
            }
            return typeof encodedData === 'string' ? JSON.parse(encodedData) : encodedData;
        } catch (e) {
            console.error('Error decoding data:', e);
            return null;
        }
    }

    async loadFile(filepath) {
        // Check cache first
        if (this.fileCache.has(filepath)) {
            return this.fileCache.get(filepath);
        }
        
        try {
            const response = await fetch(this.dataPath + filepath);
            if (!response.ok) throw new Error(`Failed to load ${filepath}: ${response.status}`);
            
            const rawData = await response.text();
            const data = this.decodeData(rawData);
            
            // Cache the decoded data
            this.fileCache.set(filepath, data);
            return data;
        } catch (error) {
            console.error(`Error loading ${filepath}:`, error);
            throw error;
        }
    }

    async loadItem(itemId) {
        return await this.loadFile(`items/${itemId}.json`);
    }

    async loadKit(kitId) {
        return await this.loadFile(`kits/${kitId}.json`);
    }

    async loadModel(modelId) {
        return await this.loadFile(`models/${modelId}.json`);
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x3E3529);

        this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 1000);
        this.camera.position.set(0, 1.0, 2.5);
        this.camera.lookAt(0, 0.8, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        this.characterModel = new THREE.Group();
        this.scene.add(this.characterModel);

        // Initialize raycaster for tooltip system
        this.raycaster = new THREE.Raycaster();

        this.setupLighting();
        this.setupControls();
        this.setupTooltip();

        window.addEventListener('resize', () => this.onWindowResize());
        this.animate();
        console.log('Character viewer initialized');
    }
    
    setKitLookup(lookupData) {
        this.kitLookup = { ...lookupData };

        for (const id in this.kitLookup) {
            const entry = this.kitLookup[id];
            if (entry.femaleCounterpart) {
                const counterpartId = entry.femaleCounterpart;
                if (this.kitLookup[counterpartId]) {
                    this.kitLookup[counterpartId].maleCounterpart = parseInt(id);
                } else {
                    console.warn(`Kit ${id} lists counterpart ${counterpartId}, but it was not found in the lookup table.`);
                }
            }
        }
    }

    // --- PLAYER COLOR METHODS ---

    // Synchronously sets color variables and the override map. Does not rebuild the model.
    initializePlayerColors() {
        for (const [colorType, hexValue] of Object.entries(this.defaultPlayerColorsHex)) {
            this.playerColors[colorType] = hexToJagexHsl(hexValue);
        }
        this.buildColorOverrideMap();
    }

    // Helper to build the color override map from the current playerColors state.
    buildColorOverrideMap() {
        this.playerColorOverrides = {};
        for (const [colorType, hslValue] of Object.entries(this.playerColors)) {
            if (hslValue !== null && this.playerColorMappings[colorType]) {
                this.playerColorOverrides[this.playerColorMappings[colorType]] = hslValue;
            }
        }
    }

    // Asynchronously rebuilds all currently equipped meshes to apply the current color state.
    async applyCurrentColorsToModel() {
        const promises = [];
        const kitsToRebuild = Array.from(this.equippedKits.entries());
        const itemsToRebuild = Array.from(this.equippedItems.entries());

        for (const [category, kitData] of kitsToRebuild) {
            promises.push(this.equipKit(category, kitData));
        }
        for (const [category, itemData] of itemsToRebuild) {
            promises.push(this.equipItem(category, itemData));
        }
        await Promise.all(promises);
    }

    async setPlayerColor(colorType, hexValue) {
        this.playerColors[colorType] = hexToJagexHsl(hexValue);
        this.buildColorOverrideMap();
        await this.applyCurrentColorsToModel();
    }

    async resetPlayerColor(colorType) {
        const defaultHex = this.defaultPlayerColorsHex[colorType];
        if (defaultHex) {
            await this.setPlayerColor(colorType, defaultHex);
        }
        return defaultHex; // Return the default hex for the UI to update
    }

    async resetAllPlayerColors() {
        this.initializePlayerColors();
        await this.applyCurrentColorsToModel();
    }

    // --- MESH AND EQUIPMENT METHODS ---

    async refreshAllMeshes() {
        // This function is now less critical for state changes, but useful for things like wireframe toggle.
        // It's safer to rebuild meshes when state changes.
        const allMeshes = [...this.itemMeshes.values(), ...this.kitMeshes.values()];
        for (const mesh of allMeshes) {
            if (mesh.material && mesh.material.wireframe !== undefined) {
                mesh.material.wireframe = wireframeMode;
            }
        }
    }

    isPartHidden(category) {
        const partsToHide = new Set();
        for (const item of this.equippedItems.values()) {
            [item.wearPos1, item.wearPos2, item.wearPos3].forEach(pos => {
                if (pos !== null && WEAR_POS[pos]) {
                    partsToHide.add(WEAR_POS[pos]);
                }
            });
        }
        return partsToHide.has(category);
    }

    async equipDefaultKits() {
        if (!this.kitLookup) {
            console.error("Cannot equip default kits: Kit lookup table is not loaded.");
            return;
        }

        const defaultKitsToLoad = this.defaultKits[this.gender];
        const promises = [];

        for (const category in defaultKitsToLoad) {
            const kitId = defaultKitsToLoad[category];
            const kitDataFromLookup = this.kitLookup[kitId];

            if (kitDataFromLookup) {
                const kitData = {
                    id: kitId,
                    name: kitDataFromLookup.name,
                    bodyPartName: category,
                    gender: kitDataFromLookup.gender
                };
                promises.push(this.equipKit(category, kitData));
            } else {
                console.warn(`Default kit for ${category} (ID: ${kitId}) not found in lookup table.`);
            }
        }
        await Promise.all(promises);
        this.updateKitVisibility();
    }

    async loadPreset(presetData) {
        // --- 1. Initial Check and Lock ---
        // Prevent multiple operations from running at the same time.
        if (this.isBusy) {
            console.warn("Viewer is busy, please wait for the current operation to complete.");
            return;
        }
        this.isBusy = true;
        console.log('%c--- Starting Preset Load ---', 'color: #00ff00; font-weight: bold;', presetData.name || 'Unnamed Preset');
        console.log('Preset data received:', presetData);
    
        try {
            // --- 2. Full Character Reset ---
            // This is a critical step. We start with a completely blank slate.
            // The 'false' argument prevents it from immediately re-equipping default kits.
            console.log('Step 1: Performing a full character reset (without defaults).');
            await this.resetCharacter(false);
    
            // --- 3. Set Gender ---
            // The character's gender must be set before any models are loaded.
            if (presetData.gender && presetData.gender !== this.gender) {
                console.log(`Step 2: Changing gender from ${this.gender} to ${presetData.gender}.`);
                this.gender = presetData.gender;
            } else {
                console.log(`Step 2: Gender is already correct (${this.gender}).`);
            }
    
            // --- 4. Apply Player Colors ---
            // Colors are applied before models are created so they are colored correctly on the first render.
            console.log('Step 3: Applying player colors from preset.');
            if (presetData.playerColors && Object.keys(presetData.playerColors).length > 0) {
                for (const [colorType, colorData] of Object.entries(presetData.playerColors)) {
                    if (colorData.hex) {
                        console.log(`  - Setting ${colorType} to ${colorData.hex}`);
                        this.playerColors[colorType] = hexToJagexHsl(colorData.hex);
                    }
                }
                // After setting the colors, build the internal map used for rendering.
                this.buildColorOverrideMap();
            } else {
                console.log('  - No custom colors found in preset. Defaults will be used.');
            }
    
            // --- 5. Equip Kits from Preset ---
            // Now, we load only the specific kits defined in the preset.
            console.log('Step 4: Equipping kit parts from preset.');
            if (presetData.kits && Object.keys(presetData.kits).length > 0) {
                const kitIds = Object.values(presetData.kits);
                console.log(`  - Found ${kitIds.length} kit(s) to load:`, kitIds);
                const kitPromises = kitIds.map(kitId => this.loadKitById(kitId));
                await Promise.all(kitPromises);
            } else {
                // This is how we handle "empty" slots for kits.
                console.log('  - No kits found in this preset. Character will have no default body parts.');
            }
    
            // --- 6. Equip Items from Preset ---
            // Finally, we load the wearable items.
            console.log('Step 5: Equipping items from preset.');
            if (presetData.items && Object.keys(presetData.items).length > 0) {
                const itemEntries = Object.entries(presetData.items);
                console.log(`  - Found ${itemEntries.length} item(s) to load:`, itemEntries);
                const itemPromises = itemEntries.map(([category, itemId]) => this.loadItemByIdAndCategory(itemId, category));
                await Promise.all(itemPromises);
            } else {
                // This handles presets with no gear, like a "naked" character.
                console.log('  - No items found in this preset. All gear slots will be empty.');
            }
            
            console.log('%c--- Preset Loaded Successfully ---', 'color: #00ff00; font-weight: bold;');
    
        } catch (error) {
            // --- Error Handling ---
            console.error('%c--- An error occurred while loading the preset ---', 'color: #ff0000; font-weight: bold;', error);
        } finally {
            // --- Release Lock ---
            // Ensure the viewer is ready for the next operation, even if an error occurred.
            this.isBusy = false;
            console.log('Operation finished, lock released.');
        }
    }

    /**
     * Load a kit by its ID
     * @param {number} kitId - The kit ID to load
     */
    async loadKitById(kitId) {
        if (!this.kitLookup || !this.kitLookup[kitId]) {
            console.warn(`Kit ID ${kitId} not found in lookup table`);
            return;
        }
        
        const kitData = this.kitLookup[kitId];
        const bodyPartName = kitData.kitType.charAt(0).toUpperCase() + kitData.kitType.slice(1).toLowerCase();
        
        const kitToEquip = {
            id: kitId,
            name: kitData.name,
            bodyPartName: bodyPartName,
            gender: kitData.gender
        };
        
        if (kitData.gender === this.gender || !kitData.gender) {
            await this.equipKit(bodyPartName, kitToEquip);
        } else {
            console.warn(`Kit ${kitId} gender (${kitData.gender}) doesn't match current gender (${this.gender})`);
        }
    }
    
    async loadItemByIdAndCategory(itemId, category) {
        try {
            const itemData = await this.loadItem(itemId);
            await this.equipItem(category, itemData);
        } catch (error) {
            console.error(`Failed to load item ${itemId} for category ${category}:`, error);
        }
    }

    /**
     * Load an item by its ID using its default slot
     * @param {number} itemId - The item ID to load
     */
    async loadItemById(itemId) {
        try {
            const itemData = await this.loadItem(itemId);
            await this.equipItem(itemData.wearPos1Name, itemData);
        } catch (error) {
            console.error(`Failed to load item ${itemId}:`, error);
        }
    }

    /**
     * Get current equipment state for saving presets
     * @returns {Object} Current equipment configuration
     */
    getCurrentEquipment() {
        const equipment = {
            gender: this.gender,
            items: Array.from(this.equippedItems.values()).map(item => item.id),
            kits: Array.from(this.equippedKits.values()).map(kit => kit.id)
        };
        
        return equipment;
    }

	async setGender(newGender, internalCall = false) {
		if (this.gender === newGender) return;
		if (!internalCall && this.isBusy) {
			console.warn("Viewer is busy, please wait.");
			return;
		}
		this.isBusy = true;

		try {
			this.gender = newGender;
			const currentItems = Array.from(this.equippedItems.values());
			const currentKits = Array.from(this.equippedKits.values());

			// Reset without equipping defaults and preserve current colors
			await this.resetCharacter(false, false);

			// Re-equip items for the new gender
			const itemPromises = currentItems.map(item => this.equipItem(item.wearPos1Name, item));
			await Promise.all(itemPromises);

			// Equip defaults for the new gender first
			await this.equipDefaultKits();

			// Then try to equip counterparts for any non-default kits
			const kitPromises = currentKits.map(async (kit) => {
				const lookupEntry = this.kitLookup ? this.kitLookup[kit.id] : null;
				let counterpartId = null;

				if (lookupEntry) {
					counterpartId = (newGender === 'female') ? lookupEntry.femaleCounterpart : lookupEntry.maleCounterpart;
				}

				if (counterpartId !== undefined && counterpartId !== null) {
					await this.loadKitById(counterpartId);
				}
			});
			await Promise.all(kitPromises);

		} catch (error) {
			console.error("Error setting gender:", error);
		} finally {
			if (!internalCall) {
				this.isBusy = false;
			}
		}
	}

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(5, 5, 5);
        this.scene.add(keyLight);
        
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        fillLight.position.set(-5, 2, 3);
        this.scene.add(fillLight);
    }

    setupControls() {
        let isMouseDown = false;
        let mouseX = 0;
        let targetRotationY = 0;
        let rotationY = 0;

        const canvas = this.renderer.domElement;

        canvas.addEventListener('mousedown', (e) => { isMouseDown = true; mouseX = e.clientX; });
        canvas.addEventListener('mouseup', () => { isMouseDown = false; });
        canvas.addEventListener('mouseleave', () => { 
            isMouseDown = false; 
            this.hideTooltip();
        });

        canvas.addEventListener('mousemove', (e) => {
            // Update mouse position for raycasting
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            // Handle rotation
            if (isMouseDown) {
                targetRotationY += (e.clientX - mouseX) * 0.015;
                mouseX = e.clientX;
            } else {
                // Only show tooltip when not rotating
                this.updateTooltip(e);
            }
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.camera.position.z += e.deltaY * 0.002;
            this.camera.position.z = Math.max(1, Math.min(10, this.camera.position.z));
        });

        const updateRotation = () => {
            rotationY += (targetRotationY - rotationY) * 0.1;
            this.characterModel.rotation.y = rotationY; // Rotate the group instead of the scene
            requestAnimationFrame(updateRotation);
        };
        updateRotation();
    }

    setupTooltip() {
        // Create tooltip element
        this.tooltip = document.createElement('div');
        this.tooltip.style.cssText = `
            position: absolute;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            pointer-events: none;
            z-index: 1000;
            visibility: hidden;
            white-space: nowrap;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        `;
        document.body.appendChild(this.tooltip);
    }

    updateTooltip(mouseEvent) {
        // Update raycaster
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const intersects = this.raycaster.intersectObjects(this.characterModel.children);

        if (intersects.length > 0) {
            const intersectedObject = intersects[0].object;
            
            if (this.hoveredObject !== intersectedObject) {
                this.hoveredObject = intersectedObject;
                this.showTooltip(intersectedObject, mouseEvent);
            } else {
                // Update tooltip position
                this.updateTooltipPosition(mouseEvent);
            }
        } else {
            if (this.hoveredObject) {
                this.hideTooltip();
                this.hoveredObject = null;
            }
        }
    }

    showTooltip(mesh, mouseEvent) {
        if (!mesh.userData.itemData) return;

        const itemData = mesh.userData.itemData;
        let tooltipText = itemData.name;
        
        // Add type information
        if (itemData.bodyPartName) {
            tooltipText += ` - ${itemData.bodyPartName}`;
        } else if (itemData.wearPos1Name) {
            tooltipText += ` - ${itemData.wearPos1Name}`;
        }

        this.tooltip.textContent = tooltipText;
        this.tooltip.style.visibility = 'visible';
        this.updateTooltipPosition(mouseEvent);
    }

    updateTooltipPosition(mouseEvent) {
        if (this.tooltip.style.visibility === 'visible') {
            const tooltipRect = this.tooltip.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            let left = mouseEvent.clientX + 10;
            let top = mouseEvent.clientY - 10;
            
            // Keep tooltip within viewport bounds
            if (left + tooltipRect.width > viewportWidth) {
                left = mouseEvent.clientX - tooltipRect.width - 10;
            }
            if (top < 0) {
                top = mouseEvent.clientY + 20;
            }
            if (top + tooltipRect.height > viewportHeight) {
                top = mouseEvent.clientY - tooltipRect.height - 10;
            }
            
            this.tooltip.style.left = left + 'px';
            this.tooltip.style.top = top + 'px';
        }
    }

    hideTooltip() {
        if (this.tooltip) {
            this.tooltip.style.visibility = 'hidden';
        }
    }
    
    async equipKit(category, kitData) {
        if (this.kitMeshes.has(category)) {
            const oldMesh = this.kitMeshes.get(category);
            this.characterModel.remove(oldMesh);
            if (oldMesh.geometry) oldMesh.geometry.dispose();
            if (oldMesh.material) oldMesh.material.dispose();
        }
        const mesh = await this.createMesh(kitData, '/api/viewer/kit');
        if (mesh) {
            this.kitMeshes.set(category, mesh);
            this.characterModel.add(mesh);
            this.equippedKits.set(category, kitData);
            this.updateKitVisibility();
        }
    }

    async equipItem(category, itemData) {
        if (this.itemMeshes.has(category)) {
            const oldMesh = this.itemMeshes.get(category);
            this.characterModel.remove(oldMesh);
            if (oldMesh.geometry) oldMesh.geometry.dispose();
            if (oldMesh.material) oldMesh.material.dispose();
        }
        const mesh = await this.createMesh(itemData, '/api/viewer/item');
        if (mesh) {
            this.itemMeshes.set(category, mesh);
            this.characterModel.add(mesh);
            this.equippedItems.set(category, itemData);
            this.updateKitVisibility();
        }
    }

    async createMesh(data, apiEndpoint) {
        try {
            // Determine if this is a kit or item and load accordingly
            let modelData;
            if (apiEndpoint.includes('kit')) {
                modelData = await this.getKitModelDataForExport(data.id);
            } else {
                modelData = await this.getModelDataForExport(data.id, this.gender);
            }
            return this.createMeshFromData(modelData, data);
        } catch (error) {
            console.error(`Error creating mesh for ${data.name}:`, error);
            return null;
        }
    }

    // Replicated the backend logic for getting model data for items
	async getModelDataForExport(itemId, modelType) {
		const item = await this.loadItem(itemId);
		if (!item) throw new Error('Item not found');
		
		const modelInfo = item.models.find(m => m.type === modelType);
		if (!modelInfo) throw new Error('Model not found for this item');
		
		const recolorData = { hasRecolors: false, colorOverrides: {} };
		if (item.hasRecolors && item.recolorToFind && item.recolorToReplace) {
			const fromArray = Array.isArray(item.recolorToFind) ? item.recolorToFind : [item.recolorToFind];
			const toArray = Array.isArray(item.recolorToReplace) ? item.recolorToReplace : [item.recolorToReplace];
			if (fromArray.length > 0 && toArray.length > 0) {
				recolorData.hasRecolors = true;
				for (let i = 0; i < Math.min(fromArray.length, toArray.length); i++) {
					recolorData.colorOverrides[fromArray[i]] = toArray[i];
				}
			}
		}
		
		const blenderData = {
			metadata: {
				itemId: itemId,
				itemName: item.name,
				modelType: modelType,
				modelCount: modelInfo.count,
				generatedAt: new Date().toISOString()
			},
			models: {},
			items: []
		};
		
		let vertexOffset = 0;
		const combinedVertices = [];
		const combinedFaces = [];
		const combinedFaceColors = [];
		const combinedFaceLabels = [];
		const modelParts = [];
		
		for (const subModel of modelInfo.subModels) {
			const model = await this.loadModel(subModel.id);
			if (!model) {
				console.warn(`Model ${subModel.id} not found, skipping`);
				continue;
			}
			
			// Create a map to easily find which group a vertex belongs to
			const vertexToGroupMap = {};
			if (model.vertexGroups) {
				model.vertexGroups.forEach((group, groupIndex) => {
					if (Array.isArray(group)) {
						group.forEach(vertexIndex => {
							vertexToGroupMap[vertexIndex] = groupIndex;
						});
					}
				});
			}
			
			// Process faces for this sub-model - FIXED for JSON cache structure
			for (let i = 0; i < model.faceCount; i++) {
				// JSON cache structure: model.faces[i] = [v1, v2, v3]
				const [v1, v2, v3] = model.faces[i];

				// Add the face with the correct vertex offset
				combinedFaces.push([v1 + vertexOffset, v2 + vertexOffset, v3 + vertexOffset]);

				// Determine the face's label (using the first vertex as the reference)
				const faceLabel = vertexToGroupMap[v1] ?? -1;
				combinedFaceLabels.push(faceLabel);
				
				// Also carry over the face color
				if (model.faceColors && i < model.faceColors.length) {
					combinedFaceColors.push(model.faceColors[i]);
				} else {
					combinedFaceColors.push(0); // Default color
				}
			}
			
			// Export individual model data - FIXED for JSON cache structure
			blenderData.models[subModel.id] = {
				modelId: subModel.id,
				modelType: subModel.type,
				vertexCount: model.vertexCount,
				faceCount: model.faceCount,
				vertices: model.vertices, // Already in [x,y,z] format
				faces: model.faces,       // Already in [v1,v2,v3] format
				vertexGroups: model.vertexGroups || [],
				faceColors: model.faceColors || [],
				hasColors: !!(model.faceColors && model.faceColors.length > 0),
				vertexOffset: vertexOffset
			};
			
			// Add vertices to combined array - FIXED for JSON cache structure
			combinedVertices.push(...model.vertices);
			
			modelParts.push({
				modelId: subModel.id,
				modelType: subModel.type,
				vertexStart: vertexOffset,
				vertexEnd: vertexOffset + model.vertexCount - 1,
				faceStart: combinedFaces.length - model.faceCount,
				faceEnd: combinedFaces.length - 1
			});
			
			vertexOffset += model.vertexCount;
		}
		
		// Filter out root faces (label 0) before creating mesh
		const filteredFaces = [];
		const filteredFaceColors = [];
		const filteredFaceLabels = [];
		let rootFacesRemoved = 0;
		
		for (let i = 0; i < combinedFaces.length; i++) {
			const faceLabel = combinedFaceLabels[i];
			if (faceLabel !== 0) {
				filteredFaces.push(combinedFaces[i]);
				filteredFaceLabels.push(faceLabel);
				if (combinedFaceColors[i] !== undefined) {
					filteredFaceColors.push(combinedFaceColors[i]);
				}
			} else {
				rootFacesRemoved++;
			}
		}
		
		if (rootFacesRemoved > 0) {
			console.log(`Filtered ${rootFacesRemoved} root faces from item ${item.name} before export`);
		}

		blenderData.models['combined'] = {
			modelId: 'combined',
			modelType: modelType,
			vertexCount: combinedVertices.length,
			faceCount: filteredFaces.length,
			vertices: combinedVertices,
			faces: filteredFaces,
			faceColors: filteredFaceColors,
			faceLabels: filteredFaceLabels,
			modelParts: modelParts,
			hasColors: filteredFaceColors.length > 0,
			isCombined: true,
			rootFacesFiltered: rootFacesRemoved
		};
		
		blenderData.items.push({
			id: itemId,
			name: item.name,
			modelType: modelType,
			modelId: 'combined',
			hasRecolors: recolorData.hasRecolors,
			colorOverrides: recolorData.colorOverrides,
			isCombined: true,
			partCount: modelInfo.count
		});
		
		return blenderData;
	}

    // Replicated the backend logic for getting kit model data
	async getKitModelDataForExport(kitId) {
		const kit = await this.loadKit(kitId);
		if (!kit) throw new Error('Kit not found');
		
		if (!kit.models || kit.models.length === 0) {
			throw new Error('Kit has no models');
		}
		
		const blenderData = {
			metadata: {
				kitId: kitId,
				kitName: kit.name,
				bodyPartName: kit.bodyPartName,
				gender: kit.gender,
				modelCount: kit.models.length,
				generatedAt: new Date().toISOString(),
				isKit: true
			},
			models: {},
			items: []
		};
		
		let vertexOffset = 0;
		const combinedVertices = [];
		const combinedFaces = [];
		const combinedFaceColors = [];
		const combinedFaceLabels = [];
		const modelParts = [];
		
		for (const modelId of kit.models) {
			const model = await this.loadModel(modelId);
			if (!model) {
				console.warn(`Kit model ${modelId} not found, skipping`);
				continue;
			}
			
			// Create a map to easily find which group a vertex belongs to
			const vertexToGroupMap = {};
			if (model.vertexGroups) {
				model.vertexGroups.forEach((group, groupIndex) => {
					if (Array.isArray(group)) {
						group.forEach(vertexIndex => {
							vertexToGroupMap[vertexIndex] = groupIndex;
						});
					}
				});
			}

			// Process faces for this sub-model - FIXED for JSON cache structure
			for (let i = 0; i < model.faceCount; i++) {
				// JSON cache structure: model.faces[i] = [v1, v2, v3]
				const [v1, v2, v3] = model.faces[i];

				// Add the face with the correct vertex offset
				combinedFaces.push([v1 + vertexOffset, v2 + vertexOffset, v3 + vertexOffset]);

				// Determine the face's label (using the first vertex as the reference)
				const faceLabel = vertexToGroupMap[v1] ?? -1;
				combinedFaceLabels.push(faceLabel);
				
				// Also carry over the face color
				if (model.faceColors && i < model.faceColors.length) {
					combinedFaceColors.push(model.faceColors[i]);
				} else {
					combinedFaceColors.push(0); // Default color
				}
			}
			
			// Export individual model data - FIXED for JSON cache structure
			blenderData.models[modelId] = {
				modelId: modelId,
				modelType: 'kit',
				vertexCount: model.vertexCount,
				faceCount: model.faceCount,
				vertices: model.vertices, // Already in [x,y,z] format
				faces: model.faces,       // Already in [v1,v2,v3] format
				vertexGroups: model.vertexGroups || [],
				faceColors: model.faceColors || [],
				hasColors: !!(model.faceColors && model.faceColors.length > 0),
				vertexOffset: vertexOffset
			};
			
			// Add vertices to combined array - FIXED for JSON cache structure
			combinedVertices.push(...model.vertices);
			
			modelParts.push({
				modelId: modelId,
				modelType: 'kit',
				vertexStart: vertexOffset,
				vertexEnd: vertexOffset + model.vertexCount - 1,
				faceStart: combinedFaces.length - model.faceCount,
				faceEnd: combinedFaces.length - 1
			});
			
			vertexOffset += model.vertexCount;
		}
		
		// Filter out root faces (label 0) before creating mesh
		const filteredFaces = [];
		const filteredFaceColors = [];
		const filteredFaceLabels = [];
		let rootFacesRemoved = 0;
		
		for (let i = 0; i < combinedFaces.length; i++) {
			const faceLabel = combinedFaceLabels[i];
			if (faceLabel !== 0) {
				filteredFaces.push(combinedFaces[i]);
				filteredFaceLabels.push(faceLabel);
				if (combinedFaceColors[i] !== undefined) {
					filteredFaceColors.push(combinedFaceColors[i]);
				}
			} else {
				rootFacesRemoved++;
			}
		}
		
		if (rootFacesRemoved > 0) {
			console.log(`Filtered ${rootFacesRemoved} root faces from kit ${kit.name} before export`);
		}

		blenderData.models['combined'] = {
			modelId: 'combined',
			modelType: 'kit',
			vertexCount: combinedVertices.length,
			faceCount: filteredFaces.length,
			vertices: combinedVertices,
			faces: filteredFaces,
			faceColors: filteredFaceColors,
			faceLabels: filteredFaceLabels,
			modelParts: modelParts,
			hasColors: filteredFaceColors.length > 0,
			isCombined: true,
			rootFacesFiltered: rootFacesRemoved
		};
		
		blenderData.items.push({
			id: kitId,
			name: kit.name,
			modelType: 'kit',
			modelId: 'combined',
			hasRecolors: kit.hasRecolors,
			colorOverrides: kit.hasRecolors ? {
				recolorToFind: kit.recolorToFind,
				recolorToReplace: kit.recolorToReplace
			} : {},
			isCombined: true,
			partCount: kit.models.length
		});
		
		return blenderData;
	}
    
    unequip(category) {
        if (this.itemMeshes.has(category)) {
            const mesh = this.itemMeshes.get(category);
            
            if (this.hoveredObject === mesh) {
                this.hideTooltip();
                this.hoveredObject = null;
            }
            
            this.characterModel.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();

            this.itemMeshes.delete(category);
            this.equippedItems.delete(category);
            this.updateKitVisibility();
        }
    }

    // Cleanup method for proper disposal
    dispose() {
        if (this.tooltip && this.tooltip.parentNode) {
            this.tooltip.parentNode.removeChild(this.tooltip);
        }
        
        this.resetCharacter(false);
        
        if (this.renderer && this.container.contains(this.renderer.domElement)) {
            this.container.removeChild(this.renderer.domElement);
        }
        
        if (this.renderer) {
            this.renderer.dispose();
        }
    }

    updateKitVisibility() {
        const partsToHide = new Set();
        for (const item of this.equippedItems.values()) {
            [item.wearPos1, item.wearPos2, item.wearPos3].forEach(pos => {
                if (pos !== null && WEAR_POS[pos]) {
                    partsToHide.add(WEAR_POS[pos]);
                }
            });
        }

        for (const [category, mesh] of this.kitMeshes.entries()) {
            mesh.visible = !partsToHide.has(category);
        }
    }

    createMeshFromData(modelData, itemData) {
        const combinedModel = modelData.models.combined;
        if (!combinedModel?.vertices || !combinedModel?.faces) return null;

        let geometry = new THREE.BufferGeometry();
        
        let processedVertices = combinedModel.vertices;
        let processedFaces = combinedModel.faces;
        let processedFaceColors = combinedModel.faceColors;
        
        // Convert vertices to Three.js format
        const vertices = new Float32Array(processedVertices.length * 3);
        for (let i = 0; i < processedVertices.length; i++) {
            const vertex = processedVertices[i];
            vertices[i * 3] = vertex[0] / 128;
            vertices[i * 3 + 1] = -vertex[1] / 128;
            vertices[i * 3 + 2] = -vertex[2] / 128;
        }
        
        // Convert faces to Three.js format
        const indices = new Uint16Array(processedFaces.length * 3);
        for (let i = 0; i < processedFaces.length; i++) {
            const face = processedFaces[i];
            indices[i * 3] = face[0];
            indices[i * 3 + 1] = face[2];
            indices[i * 3 + 2] = face[1];
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();
        
        let material;
        let faceColors = processedFaceColors;
        let hasFaceColors = faceColors && faceColors.length > 0;
        
        if (!hasFaceColors && combinedModel.modelParts) {
            const reconstructedColors = [];
            for (const part of combinedModel.modelParts) {
                const subModel = modelData.models[part.modelId];
                if (subModel && subModel.faceColors && subModel.faceColors.length > 0) {
                    const subColors = subModel.faceColors.slice(0, part.faceEnd - part.faceStart + 1);
                    reconstructedColors.push(...subColors);
                } else {
                    reconstructedColors.push(...new Array(part.faceEnd - part.faceStart + 1).fill(32777));
                }
            }
            if (reconstructedColors.length > 0) {
                faceColors = reconstructedColors;
                hasFaceColors = true;
            }
        }
        
        if (hasFaceColors) {
            let colorOverrides = {};
            if (modelData.items && Array.isArray(modelData.items)) {
                for (const item of modelData.items) {
                    if (item.hasRecolors && item.colorOverrides) {
                        Object.assign(colorOverrides, item.colorOverrides);
                    }
                }
            }
            Object.assign(colorOverrides, modelData.metadata?.colorOverrides || {}, itemData.colorOverrides || {});
            
            // Apply player color overrides (these take precedence)
            Object.assign(colorOverrides, this.playerColorOverrides);
            
            let finalColors = faceColors;
            if (Object.keys(colorOverrides).length > 0) {
                finalColors = applyColorOverrides(faceColors, colorOverrides);
            }
            
            const nonIndexedGeometry = geometry.toNonIndexed();
            const numVertices = nonIndexedGeometry.attributes.position.count;
            const colors = new Float32Array(numVertices * 3);
            let colorIdx = 0;

            for (let i = 0; i < Math.min(finalColors.length, processedFaces.length); i++) {
                const hslColor = finalColors[i];
                const rgbInt = jagexHslToRgb(hslColor);
                const [r, g, b] = rgbIntToFloatArray(rgbInt);
                for (let j = 0; j < 3; j++) {
                    colors[colorIdx++] = r;
                    colors[colorIdx++] = g;
                    colors[colorIdx++] = b;
                }
            }
            
            nonIndexedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            geometry = nonIndexedGeometry;
            
            material = new THREE.MeshPhongMaterial({
                vertexColors: true,
                side: THREE.DoubleSide,
                wireframe: wireframeMode,
                flatShading: true,
                shininess: 30,
                specular: 0x111111
            });
        } else {
            material = new THREE.MeshPhongMaterial({
                color: 0xcccccc,
                side: THREE.DoubleSide,
                wireframe: wireframeMode,
                shininess: 30,
                specular: 0x111111
            });
        }
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData.itemData = itemData; 
        return mesh;
    }

    async sendToBlender(port) {
        let totalSent = 0;
        const characterName = "ImportedCharacter"; // Can make this dynamic, Userdefinable? maybe preset name? Maybe random?

        // Signal start of character import
        try {
            console.log("Signaling start of import to Blender...");
            await fetch(`http://localhost:${port}/import_start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: characterName, gender: this.gender })
            });
        } catch (error) {
            console.error('Error signaling import start:', error);
            // Optionally, show an error to the user and stop.
            return 0;
        }

        // Send equipped items
        for (const item of this.equippedItems.values()) {
            try {
                const modelType = item.hasFemale && this.gender === 'female' ? 'female' : 'male';
                const modelData = await this.getModelDataForExport(item.id, modelType);
                
                // Add player color overrides to the model data
                this.addPlayerColorsToModelData(modelData);
                
                await this.sendToBlenderData(modelData, port);
                console.log(`Sent item ${item.name} to Blender`);
                totalSent++;
            } catch (error) {
                console.error(`Error sending item ${item.name} to Blender:`, error);
            }
        }

        // Send equipped kits (only visible ones)
        for (const kit of this.equippedKits.values()) {
            const mesh = this.kitMeshes.get(kit.bodyPartName);
            if (mesh && mesh.visible) {
                try {
                    const modelData = await this.getKitModelDataForExport(kit.id);
                    
                    // Add player color overrides to the model data
                    this.addPlayerColorsToModelData(modelData);
                    
                    await this.sendToBlenderData(modelData, port);
                    console.log(`Sent kit ${kit.name} to Blender`);
                    totalSent++;
                } catch (error) {
                    console.error(`Error sending kit ${kit.name} to Blender:`, error);
                }
            }
        }

        // Signal end of character import
        try {
            console.log("Signaling end of import to Blender...");
            await fetch(`http://localhost:${port}/import_end`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}) // Empty body is fine
            });
        } catch (error) {
            console.error('Error signaling import end:', error);
        }

        return totalSent;
    }

    addPlayerColorsToModelData(modelData) {
        // Add player color overrides to all items in the model data
        if (modelData.items && Array.isArray(modelData.items)) {
            for (const item of modelData.items) {
                if (!item.colorOverrides) {
                    item.colorOverrides = {};
                }
                // Merge player colors (they take precedence)
                Object.assign(item.colorOverrides, this.playerColorOverrides);
                
                // Mark as having player colors
                if (Object.keys(this.playerColorOverrides).length > 0) {
                    item.hasPlayerColors = true;
                    item.playerColorOverrides = { ...this.playerColorOverrides };
                }
            }
        }
        
        // Also add to metadata
        if (!modelData.metadata) {
            modelData.metadata = {};
        }
        if (Object.keys(this.playerColorOverrides).length > 0) {
            modelData.metadata.playerColorOverrides = { ...this.playerColorOverrides };
            modelData.metadata.hasPlayerColors = true;
        }
    }

    async sendToBlenderData(modelData, port) {
        try {
            const response = await fetch(`http://localhost:${port}/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(modelData)
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Blender connection failed: ${response.status} - ${errorText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error in sendToBlenderData:', error);
            throw error;
        }
    }

	async resetCharacter(equipDefaults = true, resetColors = true) {
		// This function is now mostly synchronous to avoid race conditions.
		// It clears the state and the 3D scene, but does not perform any asynchronous model loading.
		if (this.isBusy && equipDefaults) { 
			// Allow this to be called internally during a load, but not by the user.
			console.warn("Viewer is busy, please wait for the current operation to complete.");
			return;
		}
		this.isBusy = true;

		try {
			this.hideTooltip();
			this.hoveredObject = null;

			// Nuke the old model group and all its children
			this.scene.remove(this.characterModel);
			this.characterModel.traverse(object => {
				if (object.isMesh) {
					if (object.geometry) object.geometry.dispose();
					if (object.material) {
						if (Array.isArray(object.material)) {
							object.material.forEach(material => material.dispose());
						} else {
							object.material.dispose();
						}
					}
				}
			});

			// Clear all state maps
			this.equippedItems.clear();
			this.equippedKits.clear();
			this.kitMeshes.clear();
			this.itemMeshes.clear();

			// Create a fresh group and add it to the scene
			this.characterModel = new THREE.Group();
			this.scene.add(this.characterModel);

			// Only reset player colors to their defaults if explicitly requested
			if (resetColors) {
				this.initializePlayerColors();
			} else {
				// Just rebuild the color override map from current colors
				this.buildColorOverrideMap();
			}
			
			if (equipDefaults) {
				// This part is async and will re-enable the busy flag itself.
				await this.equipDefaultKits();
			}
		} catch (error) {
			console.error("Error resetting character:", error);
		} finally {
			this.isBusy = false;
		}
	}

    toggleWireframe() {
        wireframeMode = !wireframeMode;
        this.refreshAllMeshes();
    }

    onWindowResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.renderer.render(this.scene, this.camera);
    }
}