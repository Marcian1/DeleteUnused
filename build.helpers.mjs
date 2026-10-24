import { existsSync as pathExists } from "node:fs";
import fs from "node:fs/promises";

async function ensureExtensionDirectoryExists(appDir, extensionDirectoryName) {
    if (appDir.trim() !== "" && pathExists(appDir)) {
        const extDir = `${appDir}/${extensionDirectoryName}`;

        if (!pathExists(extDir)) {
            await fs.mkdir(extDir);
        }

        return extDir;
    }
}

async function copyExtensionAssetsToApplication(appExtensionDirPath, outDir) {
    const extensionName = outDir.split("/").pop();
    const deployedExtensionPath = `${appExtensionDirPath}/${extensionName}`;

    if (pathExists(deployedExtensionPath)) {
        await fs.rm(deployedExtensionPath, { recursive: true, force: true });
    }

    await fs.mkdir(deployedExtensionPath);
    await fs.cp(outDir, deployedExtensionPath, { recursive: true });
}

export const copyToAppPlugin = (appDir, outDir, extensionDirectoryName) => ({
    name: "copy-to-app",
    setup(build) {
        build.onEnd(async result => {
            if (!result.errors.length) {
                const appExtensionDirPath = await ensureExtensionDirectoryExists(appDir, extensionDirectoryName);

                if (appExtensionDirPath) {
                    copyExtensionAssetsToApplication(appExtensionDirPath, outDir);
                } else {
                    console.error("Could not find Mendix application directory:", appDir);
                    console.info("Skipping copying the extension to application directory");
                }
            }
        });
    }
});

export const copyManifestPlugin = outDir => ({
    name: "copy-manifest",
    setup(build) {
        build.onEnd(async result => {
            if (!result.errors.length) {
                try {
                    await fs.copyFile("src/manifest.json", `${outDir}/manifest.json`);
                } catch (error) {
                    console.error("Make sure that manifest.json file is present in src/ folder", error);
                }
            }
        });
    }
});

export const commonConfig = {
    target: "es2023",
    platform: "browser",
    format: "esm",
    bundle: true,
    splitting: true,
    treeShaking: true,
    logLevel: "info",
    assetNames: "assets/[ext]/[name]-[hash]",
    external: ["@mendix/component-framework", "@mendix/model-access-sdk", "@mendix/model-access-registry"],
    loader: {
        ".png": "file",
        ".svg": "file",
        ".gif": "file",
        ".ttf": "file",
        ".woff": "file",
        ".woff2": "file"
    },
    sourcemap: true
};
