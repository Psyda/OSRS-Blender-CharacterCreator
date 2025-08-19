import express from 'express';
import cors from 'cors';
import { RSCache, IndexType, ConfigType } from "osrscachereader";
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const app = express();
const PORT = 3001;

// WearPos mapping - corrected based on your feedback
const WEAR_POS = {
    0: "Head",
    1: "Cape", 
    2: "Amulet",
    3: "Weapon",
    4: "Torso",
    5: "Shield",
    6: "Arms",
    7: "Legs",
    8: "Hair",
    9: "Hands",
    10: "Boots",
    11: "Jaw",
    12: "Ring",
    13: "Ammo"
};

let cache = null;
let itemsDatabase = null;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize cache and build items database
async function initializeCache() {
    console.log("Initializing cache...");
    cache = new RSCache("../cache");
    await cache.onload;
    console.log("Cache loaded successfully!");
    
    console.log("Building items database...");
    await buildItemsDatabase();
    console.log("Items database ready!");
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
        
        // Determine if item is wearable
        const isWearable = item.interfaceOptions && item.interfaceOptions.includes("Wear");
        
        // Get wear positions
        const wearPos1 = item.wearPos1 !== undefined ? item.wearPos1 : null;
        const wearPos2 = item.wearPos2 !== undefined ? item.wearPos2 : null;
        
        // Debug logging for first few items to verify the data structure
        if (processed < 10 && (wearPos1 !== null || wearPos2 !== null)) {
            console.log(`Item ${i} (${item.name}): wearPos1=${wearPos1}, wearPos2=${wearPos2}, isWearable=${isWearable}`);
        }
        
        // Get model information
        const models = getItemModels(item);
        
        // Check if it's a 2H weapon (has both Weapon and Shield positions)
        const is2H = (wearPos1 === 3 && wearPos2 === 5) || (wearPos1 === 5 && wearPos2 === 3);
        
        // Determine available genders for this item
        const availableGenders = [];
        const hasMale = models.some(model => model.type === 'male');
        const hasFemale = models.some(model => model.type === 'female');
        
        if (hasMale) availableGenders.push('male');
        if (hasFemale) availableGenders.push('female');
        
        const itemData = {
            id: i,
            name: item.name,
            isWearable: isWearable,
            wearPos1: wearPos1,
            wearPos2: wearPos2,
            wearPos1Name: WEAR_POS[wearPos1] || null,
            wearPos2Name: WEAR_POS[wearPos2] || null,
            is2H: is2H,
            models: models,
            hasModels: models.length > 0,
            examine: item.examine || "",
            availableGenders: availableGenders,
            hasMale: hasMale,
            hasFemale: hasFemale
        };
        
        // Store in main items object
        itemsDatabase.items[i] = itemData;
        
        // Add to search index if wearable
        if (isWearable) {
            itemsDatabase.searchIndex.push({
                id: i,
                name: item.name.toLowerCase(),
                nameOriginal: item.name,
                availableGenders: availableGenders,
                hasMale: hasMale,
                hasFemale: hasFemale
            });
        }
        
        // Categorize item
        let categorized = false;
        
        if (isWearable) {
            // Check for 2H weapons first
            if (is2H) {
                itemsDatabase.categories["2H Weapons"].push(itemData);
                categorized = true;
            } else {
                // Regular categorization
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
            
            // Add to "All" category
            itemsDatabase.categories["All"].push(itemData);
        }
        
        processed++;
        if (processed % 1000 === 0) {
            console.log(`Processed ${processed} items...`);
        }
    }
    
    // Sort categories by name
    Object.keys(itemsDatabase.categories).forEach(category => {
        itemsDatabase.categories[category].sort((a, b) => a.name.localeCompare(b.name));
    });
    
    // Sort search index
    itemsDatabase.searchIndex.sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`Database built: ${processed} items processed`);
    console.log(`Wearable items by category:`);
    Object.entries(itemsDatabase.categories).forEach(([cat, items]) => {
        console.log(`  ${cat}: ${items.length} items`);
    });
    
    // Log some 2H weapons for verification
    console.log("\nSample 2H Weapons found:");
    itemsDatabase.categories["2H Weapons"].slice(0, 5).forEach(item => {
        console.log(`  ${item.name} (ID: ${item.id}) - Pos1: ${item.wearPos1Name}, Pos2: ${item.wearPos2Name}`);
    });
}

function getItemModels(item) {
    const models = [];
    
    // Collect male models
    const maleModels = [];
    if (item.maleModel0 !== undefined && item.maleModel0 !== -1) {
        maleModels.push({ type: "maleModel0", id: item.maleModel0 });
    }
    if (item.maleModel1 !== undefined && item.maleModel1 !== -1) {
        maleModels.push({ type: "maleModel1", id: item.maleModel1 });
    }
    if (item.maleModel2 !== undefined && item.maleModel2 !== -1) {
        maleModels.push({ type: "maleModel2", id: item.maleModel2 });
    }
    
    // Collect female models
    const femaleModels = [];
    if (item.femaleModel0 !== undefined && item.femaleModel0 !== -1) {
        femaleModels.push({ type: "femaleModel0", id: item.femaleModel0 });
    }
    if (item.femaleModel1 !== undefined && item.femaleModel1 !== -1) {
        femaleModels.push({ type: "femaleModel1", id: item.femaleModel1 });
    }
    if (item.femaleModel2 !== undefined && item.femaleModel2 !== -1) {
        femaleModels.push({ type: "femaleModel2", id: item.femaleModel2 });
    }
    
    // Add combined models
    if (maleModels.length > 0) {
        models.push({ 
            type: "male", 
            id: "combined", 
            subModels: maleModels,
            count: maleModels.length
        });
    }
    
    if (femaleModels.length > 0) {
        models.push({ 
            type: "female", 
            id: "combined", 
            subModels: femaleModels,
            count: femaleModels.length
        });
    }
    
    return models;
}

// Helper function to filter items by gender
function filterItemsByGender(items, gender) {
    if (gender === 'all') {
        return items;
    }
    
    return items.filter(item => {
        if (gender === 'male') {
            return item.hasMale;
        } else if (gender === 'female') {
            return item.hasFemale;
        }
        return true;
    });
}

// Helper function to get model data (shared between download and Blender endpoints)
async function getModelDataForExport(itemId, modelType) {
    const item = itemsDatabase.items[itemId];
    
    if (!item) {
        throw new Error('Item not found');
    }
    
    const modelInfo = item.models.find(m => m.type === modelType);
    if (!modelInfo) {
        throw new Error('Model not found for this item');
    }
    
    // Get full item for recolors
    const fullItem = await cache.getItem(itemId);
    
    // Get recolor data
    const recolorData = {
        hasRecolors: false,
        colorOverrides: {}
    };
    
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
    
    // Prepare model data for Blender
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
    
    // Process all sub-models for this gender
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
        
        // Store individual model data
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
        
        // Add vertices to combined mesh
        const vertices = model.vertexPositionsX.map((x, i) => [
            model.vertexPositionsX[i],
            model.vertexPositionsY[i],
            model.vertexPositionsZ[i]
        ]);
        combinedVertices.push(...vertices);
        
        // Add faces to combined mesh (with vertex offset)
        const faces = model.faceVertexIndices1.map((v1, i) => [
            model.faceVertexIndices1[i] + vertexOffset,
            model.faceVertexIndices2[i] + vertexOffset,
            model.faceVertexIndices3[i] + vertexOffset
        ]);
        combinedFaces.push(...faces);
        
        // Track this part for metadata
        modelParts.push({
            modelId: subModel.id,
            modelType: subModel.type,
            vertexStart: vertexOffset,
            vertexEnd: vertexOffset + model.vertexCount - 1,
            faceStart: combinedFaces.length - faces.length,
            faceEnd: combinedFaces.length - 1
        });
        
        vertexOffset += model.vertexCount;
        
        // Add individual item entry
        blenderData.items.push({
            id: itemId,
            name: item.name,
            modelType: subModel.type,
            modelId: subModel.id,
            hasRecolors: recolorData.hasRecolors,
            colorOverrides: recolorData.colorOverrides
        });
    }
    
    // Add combined model
    blenderData.models['combined'] = {
        modelId: 'combined',
        modelType: modelType,
        vertexCount: combinedVertices.length,
        faceCount: combinedFaces.length,
        vertices: combinedVertices,
        faces: combinedFaces,
        modelParts: modelParts,
        hasColors: false, // Combined models don't merge colors
        isCombined: true
    };
    
    // Add combined item entry
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

// Helper function to send data to Blender
async function sendToBlender(modelData, port) {
    console.log(`Attempting to send data to Blender on port ${port}`);
    
    try {
        const response = await fetch(`http://localhost:${port}/import`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(modelData)
        });
        
        console.log(`Blender response status: ${response.status}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Blender error response: ${errorText}`);
            throw new Error(`Blender connection failed: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        console.log('Blender responded successfully:', result);
        return result;
        
    } catch (error) {
        console.error('Error in sendToBlender:', error);
        throw error;
    }
}

// API Routes

// Get all categories with item counts
app.get('/api/categories', (req, res) => {
    const categories = Object.keys(itemsDatabase.categories).map(name => ({
        name,
        count: itemsDatabase.categories[name].length
    }));
    
    res.json(categories);
});

// Get items by category with gender filtering
app.get('/api/category/:categoryName', (req, res) => {
    const { categoryName } = req.params;
    const { page = 1, limit = 50, gender = 'all' } = req.query;
    
    const category = itemsDatabase.categories[categoryName];
    if (!category) {
        return res.status(404).json({ error: 'Category not found' });
    }
    
    // Filter by gender
    const filteredItems = filterItemsByGender(category, gender);
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const items = filteredItems.slice(startIndex, endIndex);
    
    res.json({
        category: categoryName,
        gender: gender,
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredItems.length,
        totalPages: Math.ceil(filteredItems.length / limit),
        items
    });
});

// Search items with gender filtering
app.get('/api/search', (req, res) => {
    const { query, category = 'All', page = 1, limit = 50, gender = 'all' } = req.query;
    
    if (!query) {
        return res.status(400).json({ error: 'Search query required' });
    }
    
    let searchResults = [];
    
    // Search by ID if query is numeric
    if (/^\d+$/.test(query)) {
        const itemId = parseInt(query);
        const item = itemsDatabase.items[itemId];
        if (item && item.isWearable) {
            searchResults = [item];
        }
    } else {
        // Search by name
        const lowerQuery = query.toLowerCase();
        const baseResults = itemsDatabase.searchIndex.filter(item => 
            item.name.includes(lowerQuery)
        ).map(item => itemsDatabase.items[item.id]);
        
        // Filter by category if specified
        if (category !== 'All') {
            const categoryItems = new Set(itemsDatabase.categories[category].map(item => item.id));
            searchResults = baseResults.filter(item => categoryItems.has(item.id));
        } else {
            searchResults = baseResults.filter(item => item.isWearable);
        }
    }
    
    // Filter by gender
    searchResults = filterItemsByGender(searchResults, gender);
    
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const items = searchResults.slice(startIndex, endIndex);
    
    res.json({
        query,
        category,
        gender,
        page: parseInt(page),
        limit: parseInt(limit),
        total: searchResults.length,
        totalPages: Math.ceil(searchResults.length / limit),
        items
    });
});

// Get specific item details
app.get('/api/item/:itemId', async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId);
        const item = itemsDatabase.items[itemId];
        
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        // Get full item definition for additional details
        const fullItem = await cache.getItem(itemId);
        
        // Get recolor information
        const recolorData = {
            hasRecolors: false,
            recolorToFind: [],
            recolorToReplace: [],
            colorOverrides: {}
        };
        
        if (fullItem.recolorToFind && fullItem.recolorToReplace) {
            const fromArray = Array.isArray(fullItem.recolorToFind) ? fullItem.recolorToFind : [fullItem.recolorToFind];
            const toArray = Array.isArray(fullItem.recolorToReplace) ? fullItem.recolorToReplace : [fullItem.recolorToReplace];
            
            if (fromArray.length > 0 && toArray.length > 0) {
                recolorData.hasRecolors = true;
                recolorData.recolorToFind = fromArray;
                recolorData.recolorToReplace = toArray;
                
                for (let i = 0; i < Math.min(fromArray.length, toArray.length); i++) {
                    recolorData.colorOverrides[fromArray[i]] = toArray[i];
                }
            }
        }
        
        res.json({
            ...item,
            recolorData,
            interfaceOptions: fullItem.interfaceOptions || []
        });
        
    } catch (error) {
        console.error('Error getting item details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Send model to Blender
app.post('/api/send-to-blender/:itemId/:modelType', async (req, res) => {
    try {
        console.log(`Received request to send item ${req.params.itemId} (${req.params.modelType}) to Blender`);
        
        const { itemId, modelType } = req.params;
        const { blenderPort = 8889 } = req.body;
        
        console.log(`Parameters: itemId=${itemId}, modelType=${modelType}, port=${blenderPort}`);
        
        // Get the model data (reuse existing logic)
        console.log('Getting model data...');
        const modelData = await getModelDataForExport(parseInt(itemId), modelType);
        console.log(`Model data generated: ${modelData.metadata.itemName} with ${Object.keys(modelData.models).length} models`);
        
        // Send to Blender
        console.log('Sending to Blender...');
        const blenderResponse = await sendToBlender(modelData, blenderPort);
        console.log('Successfully sent to Blender:', blenderResponse);
        
        res.json({
            success: true,
            message: `Model sent to Blender on port ${blenderPort}`,
            itemName: modelData.metadata.itemName,
            modelType: modelType
        });
        
    } catch (error) {
        console.error('Error in send-to-blender endpoint:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ 
            success: false, 
            error: error.message,
            stack: error.stack
        });
    }
});

// Check Blender connection
app.get('/api/blender-status/:port', async (req, res) => {
    const port = req.params.port || 8889;
    
    try {
        const response = await fetch(`http://localhost:${port}/status`, {
            method: 'GET',
            timeout: 2000
        });
        
        if (response.ok) {
            const data = await response.json();
            res.json({
                connected: true,
                port: port,
                blenderData: data
            });
        } else {
            res.json({ connected: false, port: port });
        }
    } catch (error) {
        res.json({ connected: false, port: port, error: error.message });
    }
});

// Check Blender connection with default port
app.get('/api/blender-status', async (req, res) => {
    const port = 8889;
    
    try {
        const response = await fetch(`http://localhost:${port}/status`, {
            method: 'GET',
            timeout: 2000
        });
        
        if (response.ok) {
            const data = await response.json();
            res.json({
                connected: true,
                port: port,
                blenderData: data
            });
        } else {
            res.json({ connected: false, port: port });
        }
    } catch (error) {
        res.json({ connected: false, port: port, error: error.message });
    }
});

// Export model for Blender (keep existing download functionality)
app.get('/api/item/:itemId/model/:modelType', async (req, res) => {
    try {
        const { itemId, modelType } = req.params;
        const modelData = await getModelDataForExport(parseInt(itemId), modelType);
        res.json(modelData);
        
    } catch (error) {
        console.error('Error getting model data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Debug endpoint to check specific item properties
app.get('/api/debug/item/:itemId', async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId);
        const fullItem = await cache.getItem(itemId);
        
        res.json({
            id: itemId,
            name: fullItem.name,
            allProperties: Object.keys(fullItem),
            wearPos1: fullItem.wearPos1,
            wearPos2: fullItem.wearPos2,
            interfaceOptions: fullItem.interfaceOptions,
            isWearable: fullItem.interfaceOptions && fullItem.interfaceOptions.includes("Wear"),
            rawItem: fullItem
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// Start server
app.listen(PORT, async () => {
    console.log(`Cache Explorer Server running on http://localhost:${PORT}`);
    await initializeCache();
    console.log(`Ready! Open http://localhost:${PORT} in your browser`);
});

export default app;