import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const SYNC_INTERVAL_MS = 15000; // Revisar cada 15 segundos

async function sync() {
    try {
        // 1. Traer información del repositorio remoto
        await execAsync("git fetch origin");

        // 2. Revisar si hay cambios en la nube por descargar (Lovable -> Local)
        const { stdout: status } = await execAsync("git status -uno");
        if (status.includes("behind")) {
            console.log("⏬ Cambios detectados en Lovable. Sincronizando localmente...");
            await execAsync("git pull origin main --rebase");
            console.log("✅ Código local actualizado exitosamente.");
        }

        // 3. Revisar si hay cambios locales por subir (Local -> Lovable)
        const { stdout: diff } = await execAsync("git status --porcelain");
        if (diff.trim().length > 0) {
            console.log("⏫ Cambios detectados en tu editor local. Subiendo a la nube...");
            await execAsync("git add .");
            await execAsync(`git commit -m "chore: auto-sync local changes"`);
            await execAsync("git push origin main");
            console.log("✅ Cambios locales enviados a Lovable exitosamente.");
        }
    } catch (error) {
        // Ignoramos errores menores de lock de Git si se ejecuta muy rápido, 
        // pero repotamos fallos críticos.
        if (!error.message.includes("Another git process seems to be running")) {
            console.error("❌ Error en ciclo de sincronización:", error.message.split('\n')[0]);
        }
    }
}

console.log("================================================");
console.log("🔄 AUTO-SYNC ACTIVADO (Local <-> Lovable Nube)");
console.log("================================================");
console.log(`Monitoreando cambios cada ${SYNC_INTERVAL_MS / 1000} segundos...\n`);

sync(); // Ejecutar inmediatamente la primera vez
setInterval(sync, SYNC_INTERVAL_MS);
