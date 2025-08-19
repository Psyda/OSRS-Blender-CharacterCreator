import express from 'express';
import cors from 'cors';
import { RSCache, IndexType, ConfigType } from "osrscachereader";
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const app = express();
const PORT = 3001;

// WearPos mapping for items
const WEAR_POS = {
    0: "Head", 1: "Cape", 2: "Amulet", 3: "Weapon", 4: "Torso", 5: "Shield",
    6: "Arms", 7: "Legs", 8: "Hair", 9: "Hands", 10: "Boots", 11: "Jaw", 12: "Ring", 13: "Ammo"
};

// Body part mapping for identkits - back to original logical mapping
const BODY_PART_NAMES = {
    0: "Hair",    // Male hair
    1: "Jaw",     // Male jaw  
    2: "Torso",   // Male torso
    3: "Arms",    // Male arms
    4: "Legs",    // Male legs
    5: "Hands",   // Male hands
    6: "Boots",   // Male boots
    7: "Hair",    // Female hair
    8: "Jaw",     // Female jaw
    9: "Torso",   // Female torso
    10: "Arms",   // Female arms
    11: "Legs",   // Female legs
    12: "Hands",  // Female hands
    13: "Boots"   // Female boots
};

let cache = null;
let itemsDatabase = null;
let kitsDatabase = null;
let kitLookup = null; // Will hold the parsed kit mappings

// Load kit mappings from the generated JSON file
function loadKitMappings() {
    try {
        if (!fs.existsSync('kit_lookup.json')) {
            console.warn('kit_lookup.json not found - run the Java parser first to generate kit names');
            kitLookup = {};
            return;
        }
        
        const kitMappingsData = JSON.parse(fs.readFileSync('kit_lookup.json', 'utf8'));
        kitLookup = kitMappingsData;
        console.log(`✅ Loaded ${Object.keys(kitLookup).length} kit name mappings`);
        
        // Log some examples to verify
        const testIds = [0, 45, 1, 47, 33, 67, 40, 82];
        testIds.forEach(id => {
            if (kitLookup[id]) {
                console.log(`   Kit ${id}: "${kitLookup[id].name}" (${kitLookup[id].gender} ${kitLookup[id].kitType})`);
            }
        });
        
    } catch (error) {
        console.error('❌ Error loading kit_lookup.json:', error.message);
        console.warn('Using generic kit names. Run the Java parser to generate proper names.');
        kitLookup = {};
    }
}

// Helper function to get proper kit name
function getKitName(kitId, kitData) {
    // First try the lookup table
    if (kitLookup && kitLookup[kitId]) {
        const mapping = kitLookup[kitId];
        return mapping.name; // Just return the name directly
    }
    
    // Fallback to generic name
    const bodyPartName = BODY_PART_NAMES[kitData.bodyPartId] || "Unknown";
    return `${bodyPartName} Kit #${kitId}`;
}

// Helper function to get proper gender from lookup
function getKitGender(kitId, fallbackGender) {
    if (kitLookup && kitLookup[kitId]) {
        return kitLookup[kitId].gender;
    }
    return fallbackGender;
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

async function initializeCache() {
    console.log("Initializing cache...");
    cache = new RSCache("../cache");
    await cache.onload;
    console.log("Cache loaded successfully!");
    
    console.log("Loading kit name mappings...");
    loadKitMappings();
    
    console.log("Building items database...");
    await buildItemsDatabase();
    console.log("Items database ready!");

    console.log("Building kits database...");
    await buildKitsDatabase();
    console.log("Kits database ready!");
}

async function buildItemsDatabase() {
    const allItems = await cache.getAllDefs(IndexType.CONFIGS, ConfigType.ITEM);
    
    itemsDatabase = {
        items: {},
        categories: {},
        searchIndex: []
    };
    
    // Initialize categories
    Object.values(WEAR_POS).forEach(category => {
        itemsDatabase.categories[category] = [];
    });
    itemsDatabase.categories["2H Weapons"] = [];
    itemsDatabase.categories["Other"] = [];
    itemsDatabase.categories["All"] = [];
    
    let processed = 0;
    
    for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        
        if (!item || !item.name || item.name.toLowerCase() === 'null') {
            continue;
        }
        
        const isWearable = item.interfaceOptions && (item.interfaceOptions.includes("Wear") || item.interfaceOptions.includes("Wield"));
        const wearPos1 = item.wearPos1 !== undefined ? item.wearPos1 : null;
        const wearPos2 = item.wearPos2 !== undefined ? item.wearPos2 : null;
        const models = getItemModels(item);
        const is2H = (wearPos1 === 3 && wearPos2 === 5) || (wearPos1 === 5 && wearPos2 === 3);
        
        // Determine available genders for this item
        const availableGenders = [];
        const hasMale = models.some(model => model.type === 'male');
        const hasFemale = models.some(model => model.type === 'female');
        
        if (hasMale) availableGenders.push('male');
        if (hasFemale) availableGenders.push('female');
        
        const itemData = {
            id: i, name: item.name, isWearable, wearPos1, wearPos2,
            wearPos1Name: WEAR_POS[wearPos1] || null, wearPos2Name: WEAR_POS[wearPos2] || null,
            is2H, models, hasModels: models.length > 0, examine: item.examine || "",
            availableGenders, hasMale, hasFemale
        };
        
        itemsDatabase.items[i] = itemData;
        
        if (isWearable) {
            itemsDatabase.searchIndex.push({
                id: i, name: item.name.toLowerCase(), nameOriginal: item.name,
                availableGenders, hasMale, hasFemale
            });
        }
        
        // Categorize item
        let categorized = false;
        if (isWearable) {
            if (is2H) {
                itemsDatabase.categories["2H Weapons"].push(itemData);
                categorized = true;
            } else {
                if (wearPos1 !== null && WEAR_POS[wearPos1]) {
                    itemsDatabase.categories[WEAR_POS[wearPos1]].push(itemData);
                    categorized = true;
                }
                if (wearPos2 !== null && WEAR_POS[wearPos2] && wearPos2 !== wearPos1) {
                    itemsDatabase.categories[WEAR_POS[wearPos2]].push(itemData);
                    categorized = true;
                }
            }
            if (!categorized) {
                itemsDatabase.categories["Other"].push(itemData);
            }
            itemsDatabase.categories["All"].push(itemData);
        }
        processed++;
    }
    
    // Sort categories
    Object.keys(itemsDatabase.categories).forEach(category => {
        itemsDatabase.categories[category].sort((a, b) => a.name.localeCompare(b.name));
    });
    itemsDatabase.searchIndex.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`Items database built: ${processed} items processed`);
}

async function buildKitsDatabase() {
    const allKits = await cache.getAllDefs(IndexType.CONFIGS, ConfigType.IDENTKIT);
    
    kitsDatabase = {
        kits: {},
        categories: {},
        genderCategories: { male: {}, female: {} }
    };
    
    // Initialize categories
    Object.values(BODY_PART_NAMES).forEach(partName => {
        kitsDatabase.categories[partName] = [];
        kitsDatabase.genderCategories.male[partName] = [];
        kitsDatabase.genderCategories.female[partName] = [];
    });
    
    let processed = 0;
    
    for (let i = 0; i < allKits.length; i++) {
        const kit = allKits[i];
        if (!kit) continue;
        
        const bodyPartName = BODY_PART_NAMES[kit.bodyPartId] || "Unknown";
        
        // Get proper gender and body part from lookup table (more reliable than cache bodyPartId)
        const gender = getKitGender(i, 'unknown');
        let finalBodyPartName = bodyPartName;
        
        // Use the kitType from lookup if available (more accurate than cache bodyPartId)
        if (kitLookup && kitLookup[i] && kitLookup[i].kitType) {
            const kitTypeToBodyPart = {
                'HAIR': 'Hair',
                'JAW': 'Jaw', 
                'TORSO': 'Torso',
                'ARMS': 'Arms',
                'LEGS': 'Legs',
                'HANDS': 'Hands',
                'BOOTS': 'Boots'
            };
            finalBodyPartName = kitTypeToBodyPart[kitLookup[i].kitType] || bodyPartName;
        }
        
        // Get proper kit name from lookup table
        const kitName = getKitName(i, kit);
        
        // Debug logging for problematic kits
        if (i === 45 || i === 47 || i === 67 || i === 68 || i === 70 || i === 71) {
            console.log(`🔍 Debug kit ${i}:`);
            console.log(`   Cache bodyPartId: ${kit.bodyPartId} -> "${bodyPartName}"`);
            console.log(`   Lookup kitType: ${kitLookup[i]?.kitType} -> "${finalBodyPartName}"`);
            console.log(`   Final name: "${kitName}"`);
            console.log(`   Final gender: "${gender}"`);
        }
        
        const kitData = {
            id: i,
            bodyPartId: kit.bodyPartId,
            bodyPartName: finalBodyPartName, // Use the corrected body part name
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
            // Store additional mapping info if available
            enumName: kitLookup && kitLookup[i] ? kitLookup[i].enumName : null,
            hidden: kitLookup && kitLookup[i] ? kitLookup[i].hidden : false
        };
        
        kitsDatabase.kits[i] = kitData;
        
        // Categorize by body part (skip hidden kits unless they have models)
        if (finalBodyPartName !== "Unknown" && kitData.models.length > 0) {
            // Don't filter by hidden - let all kits with models through
            kitsDatabase.categories[finalBodyPartName].push(kitData);
            
            if (gender !== 'unknown') {
                kitsDatabase.genderCategories[gender][finalBodyPartName].push(kitData);
            }
            
            // Extra debug for hands/legs
            if ((finalBodyPartName === 'Hands' || finalBodyPartName === 'Legs') && i >= 67 && i <= 73) {
                console.log(`✅ Added kit ${i}: "${kitName}" to ${finalBodyPartName} category`);
            }
        } else {
            // Debug why kits are being skipped
            if (i === 45 || i === 47) {
                console.log(`❌ Skipping kit ${i}: bodyPart="${finalBodyPartName}", modelCount=${kitData.models.length}`);
            }
        }
        
        processed++;
    }
    
    // Sort categories
    Object.keys(kitsDatabase.categories).forEach(category => {
        kitsDatabase.categories[category].sort((a, b) => a.id - b.id);
    });
    
    ['male', 'female'].forEach(gender => {
        Object.keys(kitsDatabase.genderCategories[gender]).forEach(category => {
            kitsDatabase.genderCategories[gender][category].sort((a, b) => a.id - b.id);
        });
    });
    
    console.log(`Kits database built: ${processed} kits processed`);
    console.log('Kit categories:', Object.keys(kitsDatabase.categories).map(cat => 
        `${cat}: ${kitsDatabase.categories[cat].length}`).join(', '));
}

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

function filterItemsByGender(items, gender) {
    if (gender === 'all') return items;
    return items.filter(item => {
        if (gender === 'male') return item.hasMale;
        if (gender === 'female') return item.hasFemale;
        return true;
    });
}

async function getModelDataForExport(itemId, modelType) {
    const item = itemsDatabase.items[itemId];
    if (!item) throw new Error('Item not found');
    
    const modelInfo = item.models.find(m => m.type === modelType);
    if (!modelInfo) throw new Error('Model not found for this item');
    
    const fullItem = await cache.getItem(itemId);
    
    const recolorData = { hasRecolors: false, colorOverrides: {} };
    if (fullItem.recolorToFind && fullItem.recolorToReplace) {
        const fromArray = Array.isArray(fullItem.recolorToFind) ? fullItem.recolorToFind : [fullItem.recolorToFind];
        const toArray = Array.isArray(fullItem.recolorToReplace) ? fullItem.recolorToReplace : [fullItem.recolorToReplace];
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
    const modelParts = [];
    
    for (const subModel of modelInfo.subModels) {
        const model = await cache.getDef(IndexType.MODELS, subModel.id);
        if (!model) {
            console.warn(`Model ${subModel.id} not found, skipping`);
            continue;
        }
        
        blenderData.models[subModel.id] = {
            modelId: subModel.id,
            modelType: subModel.type,
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
            vertexOffset: vertexOffset
        };
        
        const vertices = model.vertexPositionsX.map((x, i) => [
            model.vertexPositionsX[i],
            model.vertexPositionsY[i],
            model.vertexPositionsZ[i]
        ]);
        combinedVertices.push(...vertices);
        
        const faces = model.faceVertexIndices1.map((v1, i) => [
            model.faceVertexIndices1[i] + vertexOffset,
            model.faceVertexIndices2[i] + vertexOffset,
            model.faceVertexIndices3[i] + vertexOffset
        ]);
        combinedFaces.push(...faces);
        
        modelParts.push({
            modelId: subModel.id,
            modelType: subModel.type,
            vertexStart: vertexOffset,
            vertexEnd: vertexOffset + model.vertexCount - 1,
            faceStart: combinedFaces.length - faces.length,
            faceEnd: combinedFaces.length - 1
        });
        
        vertexOffset += model.vertexCount;
        
        blenderData.items.push({
            id: itemId,
            name: item.name,
            modelType: subModel.type,
            modelId: subModel.id,
            hasRecolors: recolorData.hasRecolors,
            colorOverrides: recolorData.colorOverrides
        });
    }
    
    blenderData.models['combined'] = {
        modelId: 'combined',
        modelType: modelType,
        vertexCount: combinedVertices.length,
        faceCount: combinedFaces.length,
        vertices: combinedVertices,
        faces: combinedFaces,
        modelParts: modelParts,
        hasColors: false,
        isCombined: true
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

// NEW: Kit model data export
async function getKitModelDataForExport(kitId) {
    const kit = kitsDatabase.kits[kitId];
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
    const modelParts = [];
    
    for (const modelId of kit.models) {
        const model = await cache.getDef(IndexType.MODELS, modelId);
        if (!model) {
            console.warn(`Kit model ${modelId} not found, skipping`);
            continue;
        }
        
        blenderData.models[modelId] = {
            modelId: modelId,
            modelType: 'kit',
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
            vertexOffset: vertexOffset
        };
        
        const vertices = model.vertexPositionsX.map((x, i) => [
            model.vertexPositionsX[i],
            model.vertexPositionsY[i],
            model.vertexPositionsZ[i]
        ]);
        combinedVertices.push(...vertices);
        
        const faces = model.faceVertexIndices1.map((v1, i) => [
            model.faceVertexIndices1[i] + vertexOffset,
            model.faceVertexIndices2[i] + vertexOffset,
            model.faceVertexIndices3[i] + vertexOffset
        ]);
        combinedFaces.push(...faces);
        
        modelParts.push({
            modelId: modelId,
            modelType: 'kit',
            vertexStart: vertexOffset,
            vertexEnd: vertexOffset + model.vertexCount - 1,
            faceStart: combinedFaces.length - faces.length,
            faceEnd: combinedFaces.length - 1
        });
        
        vertexOffset += model.vertexCount;
        
        blenderData.items.push({
            id: kitId,
            name: kit.name,
            modelType: 'kit',
            modelId: modelId,
            hasRecolors: kit.hasRecolors,
            colorOverrides: kit.hasRecolors ? {
                recolorToFind: kit.recolorToFind,
                recolorToReplace: kit.recolorToReplace
            } : {}
        });
    }
    
    blenderData.models['combined'] = {
        modelId: 'combined',
        modelType: 'kit',
        vertexCount: combinedVertices.length,
        faceCount: combinedFaces.length,
        vertices: combinedVertices,
        faces: combinedFaces,
        modelParts: modelParts,
        hasColors: false,
        isCombined: true
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

async function sendToBlender(modelData, port) {
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
        console.error('Error in sendToBlender:', error);
        throw error;
    }
}

// === API ROUTES ===

// Kit endpoints
app.get('/api/kit-categories', (req, res) => {
    const categories = Object.keys(kitsDatabase.categories).map(name => ({
        name,
        count: kitsDatabase.categories[name].length,
        maleCount: kitsDatabase.genderCategories.male[name]?.length || 0,
        femaleCount: kitsDatabase.genderCategories.female[name]?.length || 0
    }));
    res.json(categories);
});

app.get('/api/kits/:bodyPart', (req, res) => {
    const { bodyPart } = req.params;
    const { gender = 'all', page = 1, limit = 50 } = req.query;
    
    let kits = [];
    if (gender === 'all') {
        kits = kitsDatabase.categories[bodyPart] || [];
    } else {
        kits = kitsDatabase.genderCategories[gender]?.[bodyPart] || [];
    }
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const pageKits = kits.slice(startIndex, endIndex);
    
    res.json({
        bodyPart,
        gender,
        page: parseInt(page),
        limit: parseInt(limit),
        total: kits.length,
        totalPages: Math.ceil(kits.length / limit),
        items: pageKits
    });
});

app.get('/api/kit/:kitId', (req, res) => {
    const kitId = parseInt(req.params.kitId);
    const kit = kitsDatabase.kits[kitId];
    
    if (!kit) {
        return res.status(404).json({ error: 'Kit not found' });
    }
    
    res.json(kit);
});

app.post('/api/send-kit-to-blender/:kitId', async (req, res) => {
    try {
        const { kitId } = req.params;
        const { blenderPort = 8889 } = req.body;
        
        const modelData = await getKitModelDataForExport(parseInt(kitId));
        const blenderResponse = await sendToBlender(modelData, blenderPort);
        
        res.json({
            success: true,
            message: `Kit sent to Blender on port ${blenderPort}`,
            kitName: modelData.metadata.kitName,
            bodyPart: modelData.metadata.bodyPartName
        });
        
    } catch (error) {
        console.error('Error in send-kit-to-blender endpoint:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message
        });
    }
});

// Existing item endpoints
app.get('/api/categories', (req, res) => {
    const categories = Object.keys(itemsDatabase.categories).map(name => ({
        name,
        count: itemsDatabase.categories[name].length
    }));
    res.json(categories);
});

app.get('/api/category/:categoryName', (req, res) => {
    const { categoryName } = req.params;
    const { page = 1, limit = 50, gender = 'all' } = req.query;
    
    const category = itemsDatabase.categories[categoryName];
    if (!category) return res.status(404).json({ error: 'Category not found' });
    
    const filteredItems = filterItemsByGender(category, gender);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const items = filteredItems.slice(startIndex, endIndex);
    
    res.json({
        category: categoryName, gender, page: parseInt(page), limit: parseInt(limit),
        total: filteredItems.length, totalPages: Math.ceil(filteredItems.length / limit), items
    });
});

app.get('/api/search', (req, res) => {
    const { query, category = 'All', page = 1, limit = 50, gender = 'all' } = req.query;
    if (!query) return res.status(400).json({ error: 'Search query required' });
    
    let searchResults = [];
    if (/^\d+$/.test(query)) {
        const item = itemsDatabase.items[parseInt(query)];
        if (item && item.isWearable) searchResults = [item];
    } else {
        const lowerQuery = query.toLowerCase();
        const baseResults = itemsDatabase.searchIndex.filter(item => 
            item.name.includes(lowerQuery)
        ).map(item => itemsDatabase.items[item.id]);
        
        if (category !== 'All') {
            const categoryItems = new Set(itemsDatabase.categories[category].map(item => item.id));
            searchResults = baseResults.filter(item => categoryItems.has(item.id));
        } else {
            searchResults = baseResults.filter(item => item.isWearable);
        }
    }
    
    searchResults = filterItemsByGender(searchResults, gender);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const items = searchResults.slice(startIndex, endIndex);
    
    res.json({
        query, category, gender, page: parseInt(page), limit: parseInt(limit),
        total: searchResults.length, totalPages: Math.ceil(searchResults.length / limit), items
    });
});

app.post('/api/send-to-blender/:itemId/:modelType', async (req, res) => {
    try {
        const { itemId, modelType } = req.params;
        const { blenderPort = 8889 } = req.body;
        const modelData = await getModelDataForExport(parseInt(itemId), modelType);
        const blenderResponse = await sendToBlender(modelData, blenderPort);
        res.json({ success: true, message: `Model sent to Blender`, itemName: modelData.metadata.itemName, modelType });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/blender-status/:port', async (req, res) => {
    const port = req.params.port || 8889;
    try {
        const response = await fetch(`http://localhost:${port}/status`, { method: 'GET', timeout: 2000 });
        if (response.ok) {
            res.json({ connected: true, port, blenderData: await response.json() });
        } else {
            res.json({ connected: false, port });
        }
    } catch (error) {
        res.json({ connected: false, port, error: error.message });
    }
});

app.get('/api/blender-status', async (req, res) => {
    const port = 8889;
    try {
        const response = await fetch(`http://localhost:${port}/status`, { method: 'GET', timeout: 2000 });
        if (response.ok) {
            res.json({ connected: true, port, blenderData: await response.json() });
        } else {
            res.json({ connected: false, port });
        }
    } catch (error) {
        res.json({ connected: false, port, error: error.message });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(PORT, async () => {
    console.log(`Cache Explorer Server running on http://localhost:${PORT}`);
    await initializeCache();
    console.log(`Ready! Open http://localhost:${PORT} in your browser`);
});

export default app;