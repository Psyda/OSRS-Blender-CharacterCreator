import fs from 'fs';
import path from 'path';

// Configuration
const SOURCE_DIR = './cache';
const TARGET_DIR = './public/cache';
const GITHUB_PAGES_DIR = './docs'; // Alternative for GitHub Pages

console.log('🚀 Deploying OSRS Cache Explorer...');

// Ensure source directory exists
if (!fs.existsSync(SOURCE_DIR)) {
    console.error('❌ Source directory not found:', SOURCE_DIR);
    console.log('💡 Run "npm run extract" first to generate cache data');
    process.exit(1);
}

// Create target directory if it doesn't exist
if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    console.log('📁 Created target directory:', TARGET_DIR);
}

// Copy cache data
try {
    console.log('📋 Copying cache data...');
    fs.cpSync(SOURCE_DIR, TARGET_DIR, { recursive: true });
    console.log('✅ Cache data copied successfully');
    
    // Show what was copied
    const subdirs = ['items', 'kits', 'models'];
    console.log('📄 Deployed structure:');
    
    subdirs.forEach(subdir => {
        const dirPath = path.join(TARGET_DIR, subdir);
        if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            const totalSize = files.reduce((sum, file) => {
                const filePath = path.join(dirPath, file);
                return sum + fs.statSync(filePath).size;
            }, 0);
            const avgSizeKB = files.length > 0 ? (totalSize / files.length / 1024).toFixed(1) : 0;
            console.log(`   - ${subdir}/: ${files.length} files (avg ${avgSizeKB}KB each)`);
        }
    });
    
    // Show index file
    const indexPath = path.join(TARGET_DIR, 'index.json');
    if (fs.existsSync(indexPath)) {
        const indexSize = (fs.statSync(indexPath).size / 1024).toFixed(1);
        console.log(`   - index.json (${indexSize}KB)`);
    }
    
} catch (error) {
    console.error('❌ Error copying files:', error.message);
    process.exit(1);
}

// Load and display index info
try {
    const indexPath = path.join(TARGET_DIR, 'index.json');
    if (fs.existsSync(indexPath)) {
        const rawData = fs.readFileSync(indexPath, 'utf8');
        
        // Try to decode if it's base64 encoded
        let index;
        try {
            // Check if it's base64 encoded
            if (!rawData.startsWith('{')) {
                const decoded = Buffer.from(rawData, 'base64').toString('utf8');
                index = JSON.parse(decoded);
            } else {
                index = JSON.parse(rawData);
            }
        } catch (e) {
            index = JSON.parse(rawData);
        }
        
        console.log('\n📊 Deployment Statistics:');
        console.log(`   Version: ${index.version}`);
        console.log(`   Extracted: ${new Date(index.extractedAt).toLocaleString()}`);
        console.log(`   Items: ${index.stats.totalItems}`);
        console.log(`   Kits: ${index.stats.totalKits}`);
        console.log(`   Models: ${index.stats.totalModels}`);
        console.log(`   Encoded: ${index.encoded ? 'Yes' : 'No'}`);
        console.log(`   Categories: ${Object.keys(index.categories).length}`);
        console.log(`   Search Index: ${index.searchIndex.length} entries`);
    }
} catch (error) {
    console.warn('⚠️ Could not read index:', error.message);
}

// Check if we should also deploy to GitHub Pages directory
if (process.argv.includes('--github-pages')) {
    try {
        console.log('\n🔄 Deploying to GitHub Pages directory...');
        
        // Copy the entire public directory to docs
        if (!fs.existsSync(GITHUB_PAGES_DIR)) {
            fs.mkdirSync(GITHUB_PAGES_DIR, { recursive: true });
        }
        
        fs.cpSync('./public', GITHUB_PAGES_DIR, { recursive: true });
        console.log('✅ GitHub Pages deployment ready');
        console.log(`📁 Files deployed to: ${GITHUB_PAGES_DIR}`);
        
    } catch (error) {
        console.error('❌ GitHub Pages deployment failed:', error.message);
    }
}

// Calculate total deployment size
const calculateDirSize = (dirPath) => {
    let totalSize = 0;
    if (fs.existsSync(dirPath)) {
        const walk = (dir) => {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    walk(filePath);
                } else {
                    totalSize += stat.size;
                }
            });
        };
        walk(dirPath);
    }
    return totalSize;
};

const totalSize = calculateDirSize(TARGET_DIR);
const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);

// Generate deployment info file
const deploymentInfo = {
    deployedAt: new Date().toISOString(),
    version: '1.0.0',
    sourceDir: SOURCE_DIR,
    targetDir: TARGET_DIR,
    structure: 'individual_files',
    totalSize: totalSize,
    directories: {
        items: fs.existsSync(path.join(TARGET_DIR, 'items')) ? fs.readdirSync(path.join(TARGET_DIR, 'items')).length : 0,
        kits: fs.existsSync(path.join(TARGET_DIR, 'kits')) ? fs.readdirSync(path.join(TARGET_DIR, 'kits')).length : 0,
        models: fs.existsSync(path.join(TARGET_DIR, 'models')) ? fs.readdirSync(path.join(TARGET_DIR, 'models')).length : 0
    }
};

fs.writeFileSync(
    path.join(TARGET_DIR, 'deployment-info.json'),
    JSON.stringify(deploymentInfo, null, 2)
);

console.log('\n🎉 Deployment complete!');
console.log('💡 Next steps:');
console.log('   1. Test locally: npm run serve');
console.log('   2. Commit and push to deploy');
console.log('   3. Configure your hosting platform');

// Show local server instructions
console.log('\n🌐 To test locally:');
console.log('   npm run serve');
console.log('   # or');
console.log('   python -m http.server 8000 --directory public');
console.log('   # then open http://localhost:8000');

// Show total deployment size and structure
console.log(`\n📏 Total deployment size: ${totalSizeMB}MB`);
console.log(`📁 File structure:`);
console.log(`   - cache/items/: ${deploymentInfo.directories.items} files`);
console.log(`   - cache/kits/: ${deploymentInfo.directories.kits} files`);
console.log(`   - cache/models/: ${deploymentInfo.directories.models} files`);
console.log(`   - cache/index.json: Master index`);

if (totalSize > 100 * 1024 * 1024) { // 100MB
    console.warn('\n⚠️  Large deployment size detected. Consider:');
    console.warn('   - Using a CDN for hosting');
    console.warn('   - Implementing better compression');
    console.warn('   - Filtering unused models');
} else {
    console.log('\n✅ Deployment size is reasonable for static hosting');
}