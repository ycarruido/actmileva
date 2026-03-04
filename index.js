const sharp = require('sharp');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');

// --- CONFIGURACIÓN ---
const serviceAccount = require(path.join(__dirname, "serviceAccount.json"));

// Como es un repo solo de imágenes, REPO_PATH es la carpeta donde estás parado
const REPO_PATH = __dirname; 
const INPUT_FOLDER = path.join(__dirname, 'img', 'Paisajes Urbanos');

const GITHUB_USER = 'ycarruido';
const GITHUB_REPO = 'actmileva';

const FOLDER_NAME = 'Paisajes'; 
const COUNTRY_NAME = 'Estados Unidos'; 

// Inicializar Firebase y Git
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const git = simpleGit(REPO_PATH);

async function worldPaperProcessor() {
    try {
        // 1. Crear carpetas de estructura en el repo
        const destOriginals = path.join(REPO_PATH, 'originals', FOLDER_NAME);
        const destThumbs = path.join(REPO_PATH, 'thumbs', FOLDER_NAME);

        if (!fs.existsSync(destOriginals)) fs.mkdirSync(destOriginals, { recursive: true });
        if (!fs.existsSync(destThumbs)) fs.mkdirSync(destThumbs, { recursive: true });

        const files = fs.readdirSync(INPUT_FOLDER);
        console.log(`🚀 Procesando ${files.length} archivos...`);

        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;

            const inputPath = path.join(INPUT_FOLDER, file);
            const fileNameWebp = path.parse(file).name + '.webp';

            // Lógica de nombres y tags
            const rawName = path.parse(file).name; 
            const parts = rawName.split('-');
            const cleanTitle = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
            const autoTags = parts.slice(1).map(t => t.toLowerCase().trim());
            if (COUNTRY_NAME) autoTags.push(COUNTRY_NAME.toLowerCase());
            autoTags.push(FOLDER_NAME.toLowerCase());

            // Procesar imágenes a WebP
            await sharp(inputPath).resize(1080).webp({ quality: 80 }).toFile(path.join(destOriginals, fileNameWebp));
            await sharp(inputPath).resize(400).webp({ quality: 70 }).toFile(path.join(destThumbs, fileNameWebp));

            // Registro en Firestore
            const baseUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main`;
            const wallpaperData = {
                title: cleanTitle,
                url: `${baseUrl}/originals/${FOLDER_NAME}/${fileNameWebp}`,
                urlThumb: `${baseUrl}/thumbs/${FOLDER_NAME}/${fileNameWebp}`,
                category: FOLDER_NAME,
                tags: [...new Set(autoTags)],
                views: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            };
            if (COUNTRY_NAME) wallpaperData.country = COUNTRY_NAME;

            await db.collection('wallpapers').add(wallpaperData);
            console.log(`✅ ${fileNameWebp} lista en DB.`);
        }

        // 2. Sincronización automática con GitHub
        // --- AUTOMATIZACIÓN DE GITHUB ---
        console.log('📦 Sincronizando repositorio...');
        const isRepo = await git.checkIsRepo();
        
        if (isRepo) {
            await git.add('.');
            await git.commit(`Add: ${FOLDER_NAME} - ${files.length} wallpapers`);
            
            // Intentamos detectar la rama actual (main o master)
            const status = await git.status();
            const currentBranch = status.current; // Detecta si es main o master solo

            console.log(`Pushing to origin ${currentBranch}...`);
            await git.push('origin', currentBranch);
            
            console.log('⭐ GitHub actualizado correctamente.');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('💡 Si el push falla, asegúrate de haber corrido "git init" en esta carpeta.');
    }
}

worldPaperProcessor();