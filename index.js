const sharp = require('sharp');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');

// --- CONFIGURACIÓN ---
const serviceAccount = require(path.join(__dirname, "serviceAccount.json"));
const REPO_PATH = __dirname; 
const INPUT_FOLDER = path.join(__dirname, 'img', 'Paisajes Urbanos');

const GITHUB_USER = 'ycarruido';
const GITHUB_REPO = 'actmileva';

// AQUÍ DEFINES LA CARPETA ÚNICA (Ej: Paisajes)
const FOLDER_NAME = 'Paisajes Urbanos'; 
const COUNTRY_NAME = 'Estados Unidos'; 

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
const git = simpleGit(REPO_PATH);

async function worldPaperProcessor() {
    try {
        // Rutas directas sin crear carpetas "Nuevas" innecesarias
        const destOriginals = path.join(REPO_PATH, 'originals', FOLDER_NAME);
        const destThumbs = path.join(REPO_PATH, 'thumbs', FOLDER_NAME);

        if (!fs.existsSync(destOriginals)) fs.mkdirSync(destOriginals, { recursive: true });
        if (!fs.existsSync(destThumbs)) fs.mkdirSync(destThumbs, { recursive: true });

        const files = fs.readdirSync(INPUT_FOLDER);
        console.log(`🚀 Analizando ${files.length} archivos en la carpeta de entrada...`);

        for (const file of files) {
            const ext = path.extname(file).toLowerCase();
            
            // Si no es imagen soportada, te avisará exactamente cuál es
            if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                console.log(`⚠️ Archivo ignorado (formato no válido): ${file}`);
                continue;
            }

            const inputPath = path.join(INPUT_FOLDER, file);
            const fileNameWebp = path.parse(file).name + '.webp';

            // Generar número aleatorio (67 a 203)
            const randomVal = Math.floor(Math.random() * (203 - 67 + 1)) + 67;

            // Lógica de Título y Tags basada en guiones "-"
            const rawName = path.parse(file).name; 
            const parts = rawName.split('-'); 
            const cleanTitle = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
            
            let autoTags = parts.map(t => t.toLowerCase().trim());
            if (COUNTRY_NAME) autoTags.push(COUNTRY_NAME.toLowerCase());
            autoTags.push(FOLDER_NAME.toLowerCase());
            const finalTags = [...new Set(autoTags)].filter(t => t.length > 0);

            try {
                // Procesar Imágenes (Sharp)
                await sharp(inputPath).resize(1080).webp({ quality: 80 }).toFile(path.join(destOriginals, fileNameWebp));
                await sharp(inputPath).resize(400).webp({ quality: 70 }).toFile(path.join(destThumbs, fileNameWebp));

                // Registro en Firestore con los campos solicitados
                const baseUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/main`;
                const wallpaperData = {
                    title: cleanTitle,
                    url: `${baseUrl}/originals/${FOLDER_NAME}/${fileNameWebp}`,
                    urlThumb: `${baseUrl}/thumbs/${FOLDER_NAME}/${fileNameWebp}`,
                    category: FOLDER_NAME,
                    tags: finalTags,
                    active: true,             // Campo boolean solicitado
                    views: randomVal,         // Campo aleatorio
                    seedValue: randomVal,     // Mismo valor que views
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                };

                if (COUNTRY_NAME) wallpaperData.country = COUNTRY_NAME;

                await db.collection('wallpapers').add(wallpaperData);
                console.log(`✅ PROCESADO: ${fileNameWebp} (Views: ${randomVal})`);
            } catch (err) {
                console.error(`❌ Error crítico en archivo ${file}:`, err.message);
            }
        }

        // Sincronización GitHub (Solo sube lo nuevo sin borrar lo viejo)
        console.log('📦 Sincronizando con GitHub...');
        await git.add(['originals/*', 'thumbs/*']);
        await git.commit(`Add: New wallpapers to ${FOLDER_NAME}`);
        
        try {
            // Pull para asegurar que no hay conflictos antes de subir
            await git.pull('origin', 'main', {'--allow-unrelated-histories': null});
            await git.push('origin', 'main');
            console.log('⭐ Proceso finalizado con éxito.');
        } catch (gitErr) {
            console.error('⚠️ Error en Git, pero los archivos locales y Firebase están listos.');
        }

    } catch (error) {
        console.error('❌ Error general del script:', error.message);
    }
}

worldPaperProcessor();