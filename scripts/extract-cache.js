import { RSCache, IndexType, ConfigType } from "osrscachereader";
import fs from 'fs';
import path from 'path';

// Configuration
const CACHE_PATH = "./cache";
const OUTPUT_DIR = "./public/cache";
const ENCODE_DATA = true; // Set to false for testing, true for production

// Utility functions
function encodeData(data) {
    return ENCODE_DATA ? Buffer.from(JSON.stringify(data)).toString('base64') : JSON.stringify(data, null, 2);
}

function saveFile(filepath, data) {
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    
    const content = typeof data === 'string' ? data : encodeData(data);
    fs.writeFileSync(filepath, content);
}

// WearPos and BodyPart mappings
const WEAR_POS = {
    0: "Head", 1: "Cape", 2: "Amulet", 3: "Weapon", 4: "Torso", 5: "Shield",
    6: "Arms", 7: "Legs", 8: "Hair", 9: "Hands", 10: "Boots", 11: "Jaw", 12: "Ring", 13: "Ammo"
};

const BODY_PART_NAMES = {
    0: "Hair", 1: "Jaw", 2: "Torso", 3: "Arms", 4: "Legs", 5: "Hands", 6: "Boots",
    7: "Hair", 8: "Jaw", 9: "Torso", 10: "Arms", 11: "Legs", 12: "Hands", 13: "Boots"
};

async function extractCacheData() {
    console.log("🚀 Starting OSRS Cache Data Extraction...");
    
    // Create output directory structure
    const dirs = ['items', 'kits', 'models'];
    dirs.forEach(dir => {
        const dirPath = path.join(OUTPUT_DIR, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    });

    // Initialize cache
    console.log("📂 Loading cache...");
    const cache = new RSCache(CACHE_PATH);
    await cache.onload;
    console.log("✅ Cache loaded successfully!");

    // Load kit mappings if available
    let kitLookup = {};
    try {
        if (fs.existsSync('kit_lookup.json')) {
            kitLookup = JSON.parse(fs.readFileSync('kit_lookup.json', 'utf8'));
            console.log(`📋 Loaded ${Object.keys(kitLookup).length} kit mappings`);
        }
    } catch (error) {
        console.warn("⚠️ Could not load kit_lookup.json, using fallback names");
    }

    // Helper functions
    function getItemModels(item) {
        const models = [];
        
        const maleModels = [];
        if (item.maleModel0 !== undefined && item.maleModel0 !== -1) maleModels.push({ type: "maleModel0", id: item.maleModel0 });
        if (item.maleModel1 !== undefined && item.maleModel1 !== -1) maleModels.push({ type: "maleModel1", id: item.maleModel1 });
        if (item.maleModel2 !== undefined && item.maleModel2 !== -1) maleModels.push({ type: "maleModel2", id: item.maleModel2 });
        
        const femaleModels = [];
        if (item.femaleModel0 !== undefined && item.femaleModel0 !== -1) femaleModels.push({ type: "femaleModel0", id: item.femaleModel0 });
        if (item.femaleModel1 !== undefined && item.femaleModel1 !== -1) femaleModels.push({ type: "femaleModel1", id: item.femaleModel1 });
        if (item.femaleModel2 !== undefined && item.femaleModel2 !== -1) femaleModels.push({ type: "femaleModel2", id: item.femaleModel2 });
        
        if (maleModels.length > 0) {
            models.push({ type: "male", id: "combined", subModels: maleModels, count: maleModels.length });
        }
        if (femaleModels.length > 0) {
            models.push({ type: "female", id: "combined", subModels: femaleModels, count: femaleModels.length });
        }
        
        return models;
    }

    function getKitName(kitId, kitData) {
        if (kitLookup && kitLookup[kitId]) {
            return kitLookup[kitId].name;
        }
        const bodyPartName = BODY_PART_NAMES[kitData.bodyPartId] || "Unknown";
        return `${bodyPartName} Kit #${kitId}`;
    }

    function getKitGender(kitId, fallbackGender) {
        if (kitLookup && kitLookup[kitId] && kitLookup[kitId].gender) {
            return kitLookup[kitId].gender;
        }
        return fallbackGender;
    }

    // Track what we extract
    const extractedItems = new Set();
    const extractedKits = new Set();
    const extractedModels = new Set();
    const categories = {};
    const kitCategories = {};

    // Initialize categories
    Object.values(WEAR_POS).forEach(category => {
        categories[category] = [];
    });
    categories["2H Weapons"] = [];
    categories["Other"] = [];
    categories["All"] = [];

    Object.values(BODY_PART_NAMES).forEach(partName => {
        kitCategories[partName] = { all: [], male: [], female: [] };
    });

    // Extract Items
    console.log("🎒 Extracting items...");
    const allItems = await cache.getAllDefs(IndexType.CONFIGS, ConfigType.ITEM);
    let itemCount = 0;
    
    for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        
        if (!item || !item.name || item.name.toLowerCase() === 'null') {
            continue;
        }
        
        const isWearable = item.interfaceOptions && (item.interfaceOptions.includes("Wear") || item.interfaceOptions.includes("Wield"));
        
        if (!isWearable) continue; // Only extract wearable items
        
        const wearPos1 = item.wearPos1 !== undefined ? item.wearPos1 : null;
        const wearPos2 = item.wearPos2 !== undefined ? item.wearPos2 : null;
        const wearPos3 = item.wearPos3 !== undefined ? item.wearPos3 : null;
        const models = getItemModels(item);
        const is2H = (wearPos1 === 3 && wearPos2 === 5) || (wearPos1 === 5 && wearPos2 === 3);
        
        // Track used model IDs
        models.forEach(model => {
            model.subModels.forEach(subModel => {
                extractedModels.add(subModel.id);
            });
        });
        
        // Determine available genders
        const availableGenders = [];
        const hasMale = models.some(model => model.type === 'male');
        const hasFemale = models.some(model => model.type === 'female');
        
        if (hasMale) availableGenders.push('male');
        if (hasFemale) availableGenders.push('female');
        
        const itemData = {
            id: i,
            name: item.name,
            isWearable,
            wearPos1, wearPos2, wearPos3,
            wearPos1Name: WEAR_POS[wearPos1] || null,
            wearPos2Name: WEAR_POS[wearPos2] || null,
            wearPos3Name: WEAR_POS[wearPos3] || null,
            is2H,
            models,
            hasModels: models.length > 0,
            examine: item.examine || "",
            availableGenders,
            hasMale,
            hasFemale,
            hasRecolors: !!(item.recolorToFind && item.recolorToReplace),
            recolorToFind: item.recolorToFind || [],
            recolorToReplace: item.recolorToReplace || []
        };
        
        // Save individual item file
        const itemFilePath = path.join(OUTPUT_DIR, 'items', `${i}.json`);
        saveFile(itemFilePath, itemData);
        extractedItems.add(i);
        
        // Add to categories for index
        let categorized = false;
        if (is2H) {
            categories["2H Weapons"].push({ id: i, name: item.name, availableGenders, hasMale, hasFemale });
            categorized = true;
        } else {
            if (wearPos1 !== null && WEAR_POS[wearPos1]) {
                categories[WEAR_POS[wearPos1]].push({ id: i, name: item.name, availableGenders, hasMale, hasFemale });
                categorized = true;
            }
            if (wearPos2 !== null && WEAR_POS[wearPos2] && wearPos2 !== wearPos1) {
                categories[WEAR_POS[wearPos2]].push({ id: i, name: item.name, availableGenders, hasMale, hasFemale });
                categorized = true;
            }
            if (wearPos3 !== null && WEAR_POS[wearPos3] && wearPos3 !== wearPos2) {
                categories[WEAR_POS[wearPos3]].push({ id: i, name: item.name, availableGenders, hasMale, hasFemale });
                categorized = true;
            }
        }
        if (!categorized) {
            categories["Other"].push({ id: i, name: item.name, availableGenders, hasMale, hasFemale });
        }
        categories["All"].push({ id: i, name: item.name, availableGenders, hasMale, hasFemale });
        
        itemCount++;
        if (itemCount % 100 === 0) {
            console.log(`📈 Extracted ${itemCount} items...`);
        }
    }
    
    console.log(`✅ Extracted ${itemCount} items`);

    // Extract Kits
    console.log("👤 Extracting kits...");
    const allKits = await cache.getAllDefs(IndexType.CONFIGS, ConfigType.IDENTKIT);
    let kitCount = 0;
    
    for (let i = 0; i < allKits.length; i++) {
        const kit = allKits[i];
        if (!kit) continue;
        
        const bodyPartName = BODY_PART_NAMES[kit.bodyPartId] || "Unknown";
        const gender = getKitGender(i, 'unknown');
        let finalBodyPartName = bodyPartName;
        
        // Use the kitType from lookup if available
        if (kitLookup && kitLookup[i] && kitLookup[i].kitType) {
            const kitTypeToBodyPart = {
                'HAIR': 'Hair', 'JAW': 'Jaw', 'TORSO': 'Torso',
                'ARMS': 'Arms', 'LEGS': 'Legs', 'HANDS': 'Hands', 'BOOTS': 'Boots'
            };
            finalBodyPartName = kitTypeToBodyPart[kitLookup[i].kitType] || bodyPartName;
        }
        
        const kitName = getKitName(i, kit);
        
        // Track used model IDs
        if (kit.models && kit.models.length > 0) {
            kit.models.forEach(modelId => {
                extractedModels.add(modelId);
            });
        }
        
        const kitData = {
            id: i,
            bodyPartId: kit.bodyPartId,
            bodyPartName: finalBodyPartName,
            gender: gender,
            models: kit.models || [],
            chatheadModels: kit.chatheadModels || [],
            hasRecolors: !!(kit.recolorToFind && kit.recolorToFind.length > 0),
            hasRetextures: !!(kit.retextureToFind && kit.retextureToFind.length > 0),
            nonSelectable: kit.nonSelectable || false,
            recolorToFind: kit.recolorToFind || [],
            recolorToReplace: kit.recolorToReplace || [],
            retextureToFind: kit.retextureToFind || [],
            retextureToReplace: kit.retextureToReplace || [],
            name: kitName,
            enumName: kitLookup && kitLookup[i] ? kitLookup[i].enumName : null,
            hidden: kitLookup && kitLookup[i] ? kitLookup[i].hidden : false
        };
        
        // Save individual kit file
        const kitFilePath = path.join(OUTPUT_DIR, 'kits', `${i}.json`);
        saveFile(kitFilePath, kitData);
        extractedKits.add(i);
        
        // Add to categories for index (only kits with models)
        if (finalBodyPartName !== "Unknown" && kitData.models.length > 0) {
            const kitRef = { id: i, name: kitName, gender: gender };
            
            kitCategories[finalBodyPartName].all.push(kitRef);
            
            if (gender === 'male') {
                kitCategories[finalBodyPartName].male.push(kitRef);
            } else if (gender === 'female') {
                kitCategories[finalBodyPartName].female.push(kitRef);
            }
        }
        
        kitCount++;
        if (kitCount % 50 === 0) {
            console.log(`📈 Extracted ${kitCount} kits...`);
        }
    }
    
    console.log(`✅ Extracted ${kitCount} kits`);

    // Extract Models
    console.log("🎮 Extracting models...");
    console.log(`📊 Found ${extractedModels.size} unique models to extract`);
    
    let modelCount = 0;
    
    for (const modelId of extractedModels) {
        try {
            const model = await cache.getDef(IndexType.MODELS, modelId);
            if (!model) {
                console.warn(`⚠️ Model ${modelId} not found`);
                continue;
            }
            
            const modelData = {
                modelId: modelId,
                vertexCount: model.vertexCount,
                faceCount: model.faceCount,
                vertices: model.vertexPositionsX.map((x, i) => [
                    model.vertexPositionsX[i],
                    model.vertexPositionsY[i],
                    model.vertexPositionsZ[i]
                ]),
                faces: model.faceVertexIndices1.map((v1, i) => [
                    model.faceVertexIndices1[i],
                    model.faceVertexIndices2[i],
                    model.faceVertexIndices3[i]
                ]),
                vertexGroups: model.vertexGroups || [],
                faceColors: model.faceColors || [],
                hasColors: !!(model.faceColors && model.faceColors.length > 0),
                extractedAt: new Date().toISOString()
            };
            
            // Save individual model file
            const modelFilePath = path.join(OUTPUT_DIR, 'models', `${modelId}.json`);
            saveFile(modelFilePath, modelData);
            
            modelCount++;
            
            if (modelCount % 100 === 0) {
                console.log(`📈 Extracted ${modelCount}/${extractedModels.size} models`);
            }
            
        } catch (error) {
            console.error(`❌ Error extracting model ${modelId}:`, error.message);
        }
    }
    
    console.log(`✅ Extracted ${modelCount} models`);

    // Sort categories
    Object.keys(categories).forEach(category => {
        categories[category].sort((a, b) => a.name.localeCompare(b.name));
    });
    
    Object.keys(kitCategories).forEach(bodyPart => {
        Object.keys(kitCategories[bodyPart]).forEach(gender => {
            kitCategories[bodyPart][gender].sort((a, b) => a.id - b.id);
        });
    });

    // Create search index
    const searchIndex = categories["All"].map(item => ({
        id: item.id,
        name: item.name.toLowerCase(),
        nameOriginal: item.name,
        availableGenders: item.availableGenders,
        hasMale: item.hasMale,
        hasFemale: item.hasFemale
    })).sort((a, b) => a.name.localeCompare(b.name));

    // Create master index
    const masterIndex = {
        version: "1.0.0",
        extractedAt: new Date().toISOString(),
        encoded: ENCODE_DATA,
        stats: {
            totalItems: itemCount,
            totalKits: kitCount,
            totalModels: modelCount,
            extractedItems: Array.from(extractedItems).sort((a, b) => a - b),
            extractedKits: Array.from(extractedKits).sort((a, b) => a - b),
            extractedModels: Array.from(extractedModels).sort((a, b) => a - b)
        },
        categories: categories,
        kitCategories: kitCategories,
        searchIndex: searchIndex,
        files: {
            items: `items/{id}.json`,
            kits: `kits/{id}.json`,
            models: `models/{id}.json`
        }
    };
    
    // Save master index
    const indexPath = path.join(OUTPUT_DIR, 'index.json');
    saveFile(indexPath, masterIndex);

    console.log("🎉 Cache extraction complete!");
    console.log(`📊 Statistics:`);
    console.log(`   - Items: ${itemCount} wearable items`);
    console.log(`   - Kits: ${kitCount} kits`);
    console.log(`   - Models: ${modelCount} models`);
    console.log(`   - Output: ${OUTPUT_DIR}/`);
    console.log(`   - Structure: Individual files per ID`);
    console.log(`   - Encoded: ${ENCODE_DATA ? 'Yes' : 'No'}`);
    
    // Show directory sizes
    const itemsDirSize = fs.readdirSync(path.join(OUTPUT_DIR, 'items')).length;
    const kitsDirSize = fs.readdirSync(path.join(OUTPUT_DIR, 'kits')).length;
    const modelsDirSize = fs.readdirSync(path.join(OUTPUT_DIR, 'models')).length;
    
    console.log(`📁 Files created:`);
    console.log(`   - items/: ${itemsDirSize} files`);
    console.log(`   - kits/: ${kitsDirSize} files`);
    console.log(`   - models/: ${modelsDirSize} files`);
    console.log(`   - index.json: Master index`);
}

// Run the extraction
extractCacheData().catch(console.error);