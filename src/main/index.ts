import { ComponentContext, IComponent, getStudioProApi } from "@mendix/extensions-api";

// ── Types Exchanged between Main and UI ───────────────────────────────────────
export type ElementCategory = "Document" | "Entity" | "Attribute" | "Association";

export type UnusedItem = {
    id: string;
    name: string;
    category: ElementCategory;
    subType: string;
    moduleName: string;
    containerName?: string;
    // Internal fields for deletion
    domainModelId?: string;
    targetId?: string;
    propertyName?: string;
    isCross?: boolean;
};

export type DeleteItemRef = {
    id: string;
    category: ElementCategory;
    domainModelId?: string;
    targetId?: string;
    propertyName?: string;
    isCross?: boolean;
};

export type ScanRequest = { type: "scan" };
export type DeleteRequest = {
    type: "delete";
    ids?: string[];
    items?: DeleteItemRef[];
};
export type OpenDocumentRequest = {
    type: "openDocument";
    id: string;
};
export type ExtensionMessage = ScanRequest | DeleteRequest | OpenDocumentRequest;

export type ScanResponse = { type: "scanResult"; items: UnusedItem[] };
export type DeleteResponse = { type: "deleteResult"; deletedCount: number; errors: string[] };
export type OpenDocumentResponse = { type: "openDocumentResult"; success: boolean; error?: string };
export type ExtensionResponse = ScanResponse | DeleteResponse | OpenDocumentResponse;

// System & Standard marketplace modules that should never be deleted or flagged as unused
const SYSTEM_MODULES = new Set([
    "System",
    "Administration",
    "Atlas_Core",
    "Atlas_Web_Content",
    "Atlas_NativeMobile_Content",
    "Atlas_DesignSystem",
    "MxModelReflection",
    "CommunityCommons",
    "AppCloudServices",
    "SAML",
    "MendixSSO",
    "Nanoflow Commons",
    "Native Mobile Resources",
    "Data Widgets",
    "Mx System",
    "MxAdmin",
    "FeedbackModule",
]);

// Document types with friendly labels
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
    "Microflows$Microflow": "Microflow",
    "Microflows$Nanoflow": "Nanoflow",
    "Microflows$Rule": "Rule",
    "Pages$Page": "Page",
    "Pages$Layout": "Layout",
    "Pages$Snippet": "Snippet",
    "Pages$BuildingBlock": "Building Block",
    "Pages$PageTemplate": "Page Template",
    "Constants$Constant": "Constant",
    "Enumerations$Enumeration": "Enumeration",
    "RegularExpressions$RegularExpression": "Regular Expression",
    "DataSets$DataSet": "Dataset",
    "DocumentTemplates$DocumentTemplate": "Document Template",
    "Menus$MenuDocument": "Menu Document",
    "Images$ImageCollection": "Image Collection",
    "CustomIcons$CustomIconCollection": "Icon Collection",
    "JsonStructures$JsonStructure": "JSON Structure",
    "XmlSchemas$XmlSchema": "XML Schema",
    "Mappings$ImportMapping": "Import Mapping",
    "Mappings$ExportMapping": "Export Mapping",
    "ImportMappings$ImportMapping": "Import Mapping",
    "ExportMappings$ExportMapping": "Export Mapping",
    "JavaActions$JavaAction": "Java Action",
    "JavaScriptActions$JavaScriptAction": "JavaScript Action",
    "Queues$Queue": "Task Queue",
    "DataTransformers$DataTransformer": "Data Transformer",
    "MLMappings$MLMappingDocument": "ML Model Mapping",
    "MessageDefinitions$MessageDefinition": "Message Definition",
    "MessageDefinitions$MessageDefinitionCollection": "Message Definition",
    "MessageDefinitions$MessageDefinition2": "Message Definition",
    "Rest$ConsumedRestService": "Consumed REST Service",
    "Rest$ConsumedODataService": "Consumed OData Service",
    "WebServices$ImportedWebService": "Consumed Web Service",
    "DatabaseConnector$DatabaseConnection": "Database Connection",
    "ExcelDataImporter$Template": "Data Importer",
};

// Cache the last scanned items so UI can delete by ID if needed
let lastScannedItems: Map<string, UnusedItem> = new Map();

export const component: IComponent = {
    async loaded(componentContext: ComponentContext) {
        if (componentContext.runMode === "headless") {
            return;
        }

        const studioPro = getStudioProApi(componentContext);

        // Register menu item in Studio Pro
        await studioPro.ui.extensionsMenu.add({
            menuId: "DeleteUnused.MainMenu",
            caption: "Delete Unused Elements",
            subMenus: [
                {
                    menuId: "DeleteUnused.ShowMenu",
                    caption: "Find & Delete Unused Elements",
                    action: async () => {
                        await studioPro.ui.tabs.open(
                            {
                                title: "Unused Elements Finder",
                            },
                            {
                                componentName: "extension/DeleteUnused",
                                uiEntrypoint: "tab",
                            },
                            { isSingleton: true }
                        );
                    },
                },
            ],
        });

        // Register message handler between UI tab and this main process
        await studioPro.ui.messagePassing.addMessageHandler<ExtensionMessage>(async (messageInfo) => {
            const msg = messageInfo.message;

            if (msg.type === "openDocument") {
                try {
                    const cached = lastScannedItems.get(msg.id);
                    const targetDocId = cached?.category !== "Document" && cached?.domainModelId ? cached.domainModelId : msg.id;
                    await studioPro.ui.editors.editDocument({ id: targetDocId });
                    const response: OpenDocumentResponse = { type: "openDocumentResult", success: true };
                    await studioPro.ui.messagePassing.sendResponse(messageInfo.messageId, response);
                } catch (err: any) {
                    console.error("[DeleteUnused] editDocument error:", err);
                    const response: OpenDocumentResponse = {
                        type: "openDocumentResult",
                        success: false,
                        error: err?.message || String(err),
                    };
                    await studioPro.ui.messagePassing.sendResponse(messageInfo.messageId, response);
                }
            }

            if (msg.type === "scan") {
                try {
                    const items = await scanForUnusedElements(studioPro);
                    lastScannedItems = new Map(items.map((i) => [i.id, i]));
                    const response: ScanResponse = { type: "scanResult", items };
                    await studioPro.ui.messagePassing.sendResponse(messageInfo.messageId, response);
                } catch (err) {
                    console.error("[DeleteUnused] Scan error:", err);
                    const response: ScanResponse = { type: "scanResult", items: [] };
                    await studioPro.ui.messagePassing.sendResponse(messageInfo.messageId, response);
                }
            }

            if (msg.type === "delete") {
                // Determine item refs to delete
                let itemsToDelete: DeleteItemRef[] = [];
                if (msg.items && msg.items.length > 0) {
                    itemsToDelete = msg.items;
                } else if (msg.ids && msg.ids.length > 0) {
                    itemsToDelete = msg.ids.map((id) => {
                        const cached = lastScannedItems.get(id);
                        if (cached) {
                            return {
                                id: cached.id,
                                category: cached.category,
                                domainModelId: cached.domainModelId,
                                targetId: cached.targetId,
                                propertyName: cached.propertyName,
                                isCross: cached.isCross,
                            };
                        }
                        return { id, category: "Document" as ElementCategory };
                    });
                }

                const result = await deleteElements(studioPro, itemsToDelete);
                // Remove deleted items from our cache
                for (const item of itemsToDelete) {
                    lastScannedItems.delete(item.id);
                }

                const response: DeleteResponse = {
                    type: "deleteResult",
                    deletedCount: result.deletedCount,
                    errors: result.errors,
                };
                await studioPro.ui.messagePassing.sendResponse(messageInfo.messageId, response);
            }
        });
    },
};

/**
 * Scans the project for:
 * 1. Unused Documents (Pages, Microflows, Nanoflows, Rules, Snippets, Layouts, Enumerations, etc.)
 * 2. Unused Entities from Domain Models
 * 3. Unused Attributes from Entities in Domain Models
 * 4. Unused Associations from Domain Models
 */
async function scanForUnusedElements(
    studioPro: ReturnType<typeof getStudioProApi>
): Promise<UnusedItem[]> {
    const model = studioPro.app.model;
    const unusedItems: UnusedItem[] = [];

    // 1. Identify all user modules (excluding system and app-store modules)
    let allModules: readonly any[] = [];
    try {
        allModules = await model.modules.getModules();
    } catch {
        allModules = [];
    }

    const userModules = new Set<string>();
    for (const mod of allModules) {
        if (!SYSTEM_MODULES.has(mod.name) && !mod.fromAppStore) {
            userModules.add(mod.name);
        }
    }

    // 2. Collect all document units across the project
    type DocUnit = { id: string; name: string; type: string; moduleName: string };
    const allDocUnits: DocUnit[] = [];

    async function collectDocUnits(
        accessor: { getUnitsInfo(): Promise<readonly { $ID: string; $Type: string; name?: string; moduleName?: string }[]> },
        typeOverride?: string
    ) {
        try {
            const units = await accessor.getUnitsInfo();
            for (const u of units) {
                if (u.name && u.$ID) {
                    const type = typeOverride ?? u.$Type;
                    const label = DOCUMENT_TYPE_LABELS[type] ?? type;
                    const moduleName = u.moduleName ?? "Unknown";
                    if (userModules.has(moduleName)) {
                        allDocUnits.push({
                            id: u.$ID,
                            name: u.name,
                            type: label,
                            moduleName,
                        });
                    }
                }
            }
        } catch {
            // Silently skip inaccessible unit types
        }
    }

    await Promise.all([
        collectDocUnits(model.microflows),
        collectDocUnits(model.nanoflows),
        collectDocUnits(model.rules),
        collectDocUnits(model.pages),
        collectDocUnits(model.layouts),
        collectDocUnits(model.snippets),
        collectDocUnits(model.buildingBlocks),
        collectDocUnits(model.pageTemplates),
        collectDocUnits(model.constants),
        collectDocUnits(model.enumerations),
        collectDocUnits(model.regularExpressions),
        collectDocUnits(model.dataSets),
        collectDocUnits(model.documentTemplates),
        collectDocUnits(model.menuDocuments),
        collectDocUnits(model.imageCollections),
        collectDocUnits(model.customIconCollections),
        collectDocUnits(model.jsonStructures),
        collectDocUnits(model.xmlSchemas),
        collectDocUnits(model.importMappings),
        collectDocUnits(model.exportMappings),
        collectDocUnits(model.javaActions),
        collectDocUnits(model.javaScriptActions),
        collectDocUnits(model.queues),
        collectDocUnits(model.dataTransformers),
        collectDocUnits(model.mlMappingDocuments),
        collectDocUnits(model.messageDefinitions),
        collectDocUnits(model.messageDefinitions2),
        collectDocUnits(model.consumedRestServices),
        collectDocUnits(model.consumedODataServices),
        collectDocUnits(model.importedWebServices),
        collectDocUnits(model.databaseConnections),
        collectDocUnits(model.excelDataImporterTemplates),
    ]);

    // 3. Load Domain Models for all user modules and collect Entity, Attribute, Association candidates
    type CandidateEntity = {
        id: string;
        name: string;
        qualifiedName: string;
        moduleName: string;
        domainModelId: string;
        generalization?: string;
    };

    type CandidateAttribute = {
        id: string;
        name: string;
        qualifiedName: string;
        entityName: string;
        moduleName: string;
        typeLabel: string;
        domainModelId: string;
        entityId: string;
    };

    type CandidateAssociation = {
        id: string;
        name: string;
        qualifiedName: string;
        moduleName: string;
        parent: string;
        child: string;
        typeLabel: string;
        domainModelId: string;
        isCross: boolean;
    };

    const candidateEntities: CandidateEntity[] = [];
    const candidateAttributes: CandidateAttribute[] = [];
    const candidateAssociations: CandidateAssociation[] = [];

    // Reference tracking sets
    const referencedEntityNames = new Set<string>();
    const referencedEntityIds = new Set<string>();
    const referencedAttributeNames = new Set<string>();
    const referencedAttributeIds = new Set<string>();
    const referencedAssociationNames = new Set<string>();
    const referencedAssociationIds = new Set<string>();
    const referencedDocNames = new Set<string>();
    const referencedDocIds = new Set<string>();

    for (const modName of userModules) {
        try {
            const dm = await model.domainModels.getDomainModel(modName);
            if (!dm) continue;

            const domainModelId = dm.$ID;

            // Process Entities & Attributes
            if (Array.isArray(dm.entities)) {
                for (const entity of dm.entities) {
                    const entityQualified = `${modName}.${entity.name}`;
                    const gen = (entity.generalization as any)?.generalization;
                    if (gen && typeof gen === "string") {
                        // Mark the parent generalization entity as referenced
                        referencedEntityNames.add(gen);
                    }

                    candidateEntities.push({
                        id: entity.$ID,
                        name: entity.name,
                        qualifiedName: entityQualified,
                        moduleName: modName,
                        domainModelId,
                        generalization: gen,
                    });

                    // Check entity validation rules (attributes referenced in validation rules)
                    if (Array.isArray(entity.validationRules)) {
                        for (const vr of entity.validationRules) {
                            if ((vr as any).attribute) {
                                referencedAttributeNames.add((vr as any).attribute);
                                referencedAttributeNames.add(`${entity.name}.${(vr as any).attribute}`);
                                referencedAttributeNames.add(`${entityQualified}.${(vr as any).attribute}`);
                            }
                        }
                    }

                    // Check entity indexes
                    if (Array.isArray(entity.indexes)) {
                        for (const idx of entity.indexes) {
                            if (Array.isArray((idx as any).attributes)) {
                                for (const attr of (idx as any).attributes) {
                                    if (typeof attr === "string") {
                                        referencedAttributeNames.add(attr);
                                        referencedAttributeNames.add(`${entity.name}.${attr}`);
                                        referencedAttributeNames.add(`${entityQualified}.${attr}`);
                                    }
                                }
                            }
                        }
                    }

                    // Process Attributes
                    if (Array.isArray(entity.attributes)) {
                        for (const attr of entity.attributes) {
                            let typeLabel = "Attribute";
                            if (attr.type && typeof attr.type === "object") {
                                const rawType = (attr.type as any).$Type ?? "";
                                typeLabel = rawType.replace("DomainModels$", "").replace("AttributeType", "");
                            }

                            // If attribute has calculated value microflow, mark that microflow as used
                            const calcMicroflow = (attr.value as any)?.microflow;
                            if (calcMicroflow && typeof calcMicroflow === "string") {
                                referencedDocNames.add(calcMicroflow);
                            }

                            candidateAttributes.push({
                                id: attr.$ID,
                                name: attr.name,
                                qualifiedName: `${entityQualified}.${attr.name}`,
                                entityName: entity.name,
                                moduleName: modName,
                                typeLabel: typeLabel || "Attribute",
                                domainModelId,
                                entityId: entity.$ID,
                            });
                        }
                    }
                }
            }

            // Process Associations
            const processAssocList = (list: any[], isCross: boolean) => {
                if (!Array.isArray(list)) return;
                for (const assoc of list) {
                    const assocQualified = `${modName}.${assoc.name}`;
                    const typeLabel = assoc.type === "ReferenceSet" ? "Many-to-Many" : "1-to-Many";
                    candidateAssociations.push({
                        id: assoc.$ID,
                        name: assoc.name,
                        qualifiedName: assocQualified,
                        moduleName: modName,
                        parent: assoc.parent ?? "",
                        child: assoc.child ?? "",
                        typeLabel: isCross ? `Cross-Association (${typeLabel})` : `Association (${typeLabel})`,
                        domainModelId,
                        isCross,
                    });
                }
            };

            processAssocList(dm.associations, false);
            processAssocList(dm.crossAssociations, true);
        } catch (err) {
            console.error(`[DeleteUnused] Error reading domain model for ${modName}:`, err);
        }
    }

    // 4. Load User Documents to inspect references
    // Load pages, microflows, nanoflows, rules, snippets, layouts, etc. in parallel batches
    const loadedUnits: any[] = [];
    async function safeLoadAll(accessor: { loadAll(filter: (u: any) => boolean, max?: number): Promise<any[]> }) {
        try {
            const units = await accessor.loadAll((u) => userModules.has(u.moduleName ?? ""), 1000);
            if (Array.isArray(units)) {
                loadedUnits.push(...units);
            }
        } catch {
            // Some models might not support loadAll on certain types; ignore safely
        }
    }

    await Promise.allSettled([
        safeLoadAll(model.pages),
        safeLoadAll(model.microflows),
        safeLoadAll(model.nanoflows),
        safeLoadAll(model.rules),
        safeLoadAll(model.snippets),
        safeLoadAll(model.layouts),
        safeLoadAll(model.buildingBlocks),
        safeLoadAll(model.pageTemplates),
        safeLoadAll(model.documentTemplates),
        safeLoadAll(model.importMappings),
        safeLoadAll(model.exportMappings),
        safeLoadAll(model.dataSets),
        safeLoadAll(model.menuDocuments),
        safeLoadAll(model.javaActions),
        safeLoadAll(model.javaScriptActions),
        safeLoadAll(model.queues),
        safeLoadAll(model.dataTransformers),
        safeLoadAll(model.messageDefinitions),
        safeLoadAll(model.messageDefinitions2),
        safeLoadAll(model.consumedRestServices),
        safeLoadAll(model.consumedODataServices),
        safeLoadAll(model.importedWebServices),
    ]);

    // 5. Deep scan all loaded units for references to entities, attributes, associations, and documents
    const visited = new WeakSet<object>();

    function extractFromText(text: string) {
        if (!text || text.length < 2) return;

        // Check against candidate entities
        for (const ce of candidateEntities) {
            if (text.includes(ce.qualifiedName) || text.includes(ce.name)) {
                referencedEntityNames.add(ce.qualifiedName);
                referencedEntityNames.add(ce.name);
            }
        }

        // Check against candidate associations
        for (const ca of candidateAssociations) {
            if (text.includes(ca.qualifiedName) || text.includes(ca.name)) {
                referencedAssociationNames.add(ca.qualifiedName);
                referencedAssociationNames.add(ca.name);
            }
        }

        // Check against candidate attributes
        for (const cattr of candidateAttributes) {
            if (
                text.includes(cattr.qualifiedName) ||
                text.includes(`${cattr.entityName}.${cattr.name}`) ||
                text.includes(`${cattr.entityName}/${cattr.name}`) ||
                text.includes(`/${cattr.name}`) ||
                text.includes(`$${cattr.name}`)
            ) {
                referencedAttributeNames.add(cattr.qualifiedName);
                referencedAttributeNames.add(cattr.name);
            }
        }

        // Check against candidate documents
        for (const doc of allDocUnits) {
            if (text.includes(`${doc.moduleName}.${doc.name}`) || text.includes(doc.name)) {
                referencedDocNames.add(`${doc.moduleName}.${doc.name}`);
                referencedDocNames.add(doc.name);
            }
        }
    }

    function deepScan(node: any) {
        if (!node || typeof node !== "object") return;
        if (visited.has(node)) return;
        visited.add(node);

        // Check direct Mendix Metamodel references
        if (typeof node.entity === "string" && node.entity) {
            referencedEntityNames.add(node.entity);
        }
        if (typeof node.association === "string" && node.association) {
            referencedAssociationNames.add(node.association);
        }
        if (typeof node.attribute === "string" && node.attribute) {
            referencedAttributeNames.add(node.attribute);
        }

        // Action references (Microflows, Nanoflows, Rules, Pages, etc.)
        if (typeof node.microflow === "string" && node.microflow) referencedDocNames.add(node.microflow);
        if (typeof node.nanoflow === "string" && node.nanoflow) referencedDocNames.add(node.nanoflow);
        if (typeof node.rule === "string" && node.rule) referencedDocNames.add(node.rule);
        if (typeof node.page === "string" && node.page) referencedDocNames.add(node.page);
        if (typeof node.form === "string" && node.form) referencedDocNames.add(node.form);
        if (typeof node.snippet === "string" && node.snippet) referencedDocNames.add(node.snippet);
        if (typeof node.layout === "string" && node.layout) referencedDocNames.add(node.layout);
        if (typeof node.enumeration === "string" && node.enumeration) referencedDocNames.add(node.enumeration);
        if (typeof node.constant === "string" && node.constant) referencedDocNames.add(node.constant);

        // Java action & JavaScript action call references
        if (typeof node.javaAction === "string" && node.javaAction) referencedDocNames.add(node.javaAction);
        if (typeof node.javaScriptAction === "string" && node.javaScriptAction) referencedDocNames.add(node.javaScriptAction);

        // Task Queue references (e.g. from QueueSettings in microflow/action calls)
        if (typeof node.queue === "string" && node.queue) referencedDocNames.add(node.queue);
        if (node.queueSettings && typeof node.queueSettings.queue === "string" && node.queueSettings.queue) {
            referencedDocNames.add(node.queueSettings.queue);
        }

        // External services & transformers references
        if (typeof node.importedWebService === "string" && node.importedWebService) referencedDocNames.add(node.importedWebService);
        if (typeof node.consumedODataService === "string" && node.consumedODataService) referencedDocNames.add(node.consumedODataService);
        if (typeof node.transformation === "string" && node.transformation) referencedDocNames.add(node.transformation);
        if (typeof node.mlMappingDocument === "string" && node.mlMappingDocument) referencedDocNames.add(node.mlMappingDocument);
        if (typeof node.messageDefinition === "string" && node.messageDefinition) referencedDocNames.add(node.messageDefinition);
        if (typeof node.messageDefinitionCollection === "string" && node.messageDefinitionCollection) {
            referencedDocNames.add(node.messageDefinitionCollection);
        }
        if (typeof node.databaseConnection === "string" && node.databaseConnection) referencedDocNames.add(node.databaseConnection);
        if (typeof node.templateDocument === "string" && node.templateDocument) referencedDocNames.add(node.templateDocument);
        if (typeof node.iconCollection === "string" && node.iconCollection) referencedDocNames.add(node.iconCollection);

        // AttributeRef / EntityRef / AssociationRef
        if (node.$Type === "DomainModels$DirectEntityRef" && typeof node.entity === "string") {
            referencedEntityNames.add(node.entity);
        }
        if (node.$Type === "DomainModels$AttributeRef" && typeof node.attribute === "string") {
            referencedAttributeNames.add(node.attribute);
        }
        if (node.$Type === "DomainModels$AssociationRef" && typeof node.association === "string") {
            referencedAssociationNames.add(node.association);
        }

        // Expressions, XPath constraints, string templates
        const stringFields = [
            node.xPathConstraint,
            node.expression,
            node.value,
            node.argument,
            node.template,
            node.initialValue,
        ];
        for (const s of stringFields) {
            if (typeof s === "string") {
                extractFromText(s);
            }
        }

        // Recursively traverse child objects and arrays
        if (Array.isArray(node)) {
            for (const item of node) {
                deepScan(item);
            }
        } else {
            for (const key of Object.keys(node)) {
                deepScan(node[key]);
            }
        }
    }

    // Run scanner on all loaded units
    for (const unit of loadedUnits) {
        deepScan(unit);
    }

    // 6. Cross-reference Associations with Entities:
    // If an association is used, its parent and child entities are also considered referenced!
    for (const ca of candidateAssociations) {
        const isAssocReferenced =
            referencedAssociationNames.has(ca.qualifiedName) ||
            referencedAssociationNames.has(ca.name) ||
            referencedAssociationIds.has(ca.id);

        if (isAssocReferenced) {
            if (ca.parent) referencedEntityNames.add(ca.parent);
            if (ca.child) referencedEntityNames.add(ca.child);
        }
    }

    // 7. Filter Unused Entities
    for (const ce of candidateEntities) {
        const isUsed =
            referencedEntityNames.has(ce.qualifiedName) ||
            referencedEntityNames.has(ce.name) ||
            referencedEntityIds.has(ce.id);

        if (!isUsed) {
            unusedItems.push({
                id: ce.id,
                name: ce.name,
                category: "Entity",
                subType: "Entity",
                moduleName: ce.moduleName,
                containerName: `Module: ${ce.moduleName}`,
                domainModelId: ce.domainModelId,
                targetId: ce.domainModelId,
                propertyName: "entities",
            });
        }
    }

    // 8. Filter Unused Attributes
    for (const ca of candidateAttributes) {
        const isUsed =
            referencedAttributeNames.has(ca.qualifiedName) ||
            referencedAttributeNames.has(`${ca.entityName}.${ca.name}`) ||
            referencedAttributeNames.has(`${ca.entityName}/${ca.name}`) ||
            referencedAttributeNames.has(ca.name) ||
            referencedAttributeIds.has(ca.id);

        if (!isUsed) {
            unusedItems.push({
                id: ca.id,
                name: ca.name,
                category: "Attribute",
                subType: `Attribute (${ca.typeLabel})`,
                moduleName: ca.moduleName,
                containerName: `Entity: ${ca.entityName}`,
                domainModelId: ca.domainModelId,
                targetId: ca.entityId,
                propertyName: "attributes",
            });
        }
    }

    // 9. Filter Unused Associations
    for (const ca of candidateAssociations) {
        const isUsed =
            referencedAssociationNames.has(ca.qualifiedName) ||
            referencedAssociationNames.has(ca.name) ||
            referencedAssociationIds.has(ca.id);

        if (!isUsed) {
            const relDisplay = ca.parent && ca.child ? `${ca.parent} ➔ ${ca.child}` : "Association";
            unusedItems.push({
                id: ca.id,
                name: ca.name,
                category: "Association",
                subType: ca.typeLabel,
                moduleName: ca.moduleName,
                containerName: relDisplay,
                domainModelId: ca.domainModelId,
                targetId: ca.domainModelId,
                propertyName: ca.isCross ? "crossAssociations" : "associations",
                isCross: ca.isCross,
            });
        }
    }

    // 10. Filter Unused Documents
    const seenDocIds = new Set<string>();
    for (const doc of allDocUnits) {
        if (seenDocIds.has(doc.id)) continue;
        seenDocIds.add(doc.id);

        const qualified = `${doc.moduleName}.${doc.name}`;
        const isUsed =
            referencedDocNames.has(qualified) ||
            referencedDocNames.has(doc.name) ||
            referencedDocIds.has(doc.id);

        if (!isUsed) {
            unusedItems.push({
                id: doc.id,
                name: doc.name,
                category: "Document",
                subType: doc.type,
                moduleName: doc.moduleName,
                containerName: `Document: ${doc.type}`,
            });
        }
    }

    // Sort items by module name, category, then name
    const categoryOrder: Record<ElementCategory, number> = {
        Entity: 1,
        Attribute: 2,
        Association: 3,
        Document: 4,
    };

    return unusedItems.sort((a, b) => {
        if (a.moduleName !== b.moduleName) return a.moduleName.localeCompare(b.moduleName);
        if (categoryOrder[a.category] !== categoryOrder[b.category]) {
            return categoryOrder[a.category] - categoryOrder[b.category];
        }
        return a.name.localeCompare(b.name);
    });
}

/**
 * Deletes selected items according to their category (Document vs Domain Model element)
 */
async function deleteElements(
    studioPro: ReturnType<typeof getStudioProApi>,
    items: DeleteItemRef[]
): Promise<{ deletedCount: number; errors: string[] }> {
    const model = studioPro.app.model;
    const errors: string[] = [];
    let deletedCount = 0;

    const documentApis = [
        model.microflows,
        model.nanoflows,
        model.rules,
        model.pages,
        model.layouts,
        model.snippets,
        model.buildingBlocks,
        model.pageTemplates,
        model.constants,
        model.enumerations,
        model.regularExpressions,
        model.dataSets,
        model.documentTemplates,
        model.menuDocuments,
        model.imageCollections,
        model.customIconCollections,
        model.jsonStructures,
        model.xmlSchemas,
        model.importMappings,
        model.exportMappings,
        model.javaActions,
        model.javaScriptActions,
        model.queues,
        model.dataTransformers,
        model.mlMappingDocuments,
        model.messageDefinitions,
        model.messageDefinitions2,
        model.consumedRestServices,
        model.consumedODataServices,
        model.importedWebServices,
        model.databaseConnections,
        model.excelDataImporterTemplates,
    ];

    for (const item of items) {
        let deleted = false;

        // If it's a domain model element (Entity, Attribute, Association)
        if (item.category !== "Document" && item.domainModelId) {
            // Strategy 1: applyChanges if supported by the runtime
            try {
                const domainModelApi = model.domainModels as any;
                if (typeof domainModelApi.applyChanges === "function") {
                    await domainModelApi.applyChanges([
                        {
                            type: "removeElement",
                            unitId: item.domainModelId,
                            targetId: item.targetId ?? item.domainModelId,
                            propertyName: item.propertyName ?? (item.category === "Entity" ? "entities" : "attributes"),
                            elementId: item.id,
                        },
                    ]);
                    deleted = true;
                    deletedCount++;
                }
            } catch (err: any) {
                console.warn(`[DeleteUnused] applyChanges failed for ${item.id}:`, err);
            }

            // Strategy 2: Modify domain model in-memory and save
            if (!deleted) {
                try {
                    const dm = (await model.domainModels.load("DomainModels$DomainModel", item.domainModelId)) as any;
                    if (dm) {
                        let modified = false;
                        if (item.category === "Entity" && Array.isArray(dm.entities)) {
                            const originalLen = dm.entities.length;
                            (dm as any).entities = dm.entities.filter((e: any) => e.$ID !== item.id);
                            if ((dm.entities as any).length < originalLen) modified = true;
                        } else if (item.category === "Attribute" && Array.isArray(dm.entities)) {
                            for (const ent of dm.entities) {
                                if (Array.isArray(ent.attributes)) {
                                    const originalLen = ent.attributes.length;
                                    (ent as any).attributes = ent.attributes.filter((a: any) => a.$ID !== item.id);
                                    if ((ent.attributes as any).length < originalLen) {
                                        modified = true;
                                        break;
                                    }
                                }
                            }
                        } else if (item.category === "Association") {
                            if (Array.isArray(dm.associations)) {
                                const originalLen = dm.associations.length;
                                (dm as any).associations = dm.associations.filter((a: any) => a.$ID !== item.id);
                                if ((dm.associations as any).length < originalLen) modified = true;
                            }
                            if (!modified && Array.isArray(dm.crossAssociations)) {
                                const originalLen = dm.crossAssociations.length;
                                (dm as any).crossAssociations = dm.crossAssociations.filter((a: any) => a.$ID !== item.id);
                                if ((dm.crossAssociations as any).length < originalLen) modified = true;
                            }
                        }

                        if (modified) {
                            await model.domainModels.save(dm);
                            deleted = true;
                            deletedCount++;
                        }
                    }
                } catch (err: any) {
                    console.warn(`[DeleteUnused] save domain model failed for ${item.id}:`, err);
                }
            }

            // Strategy 3: deleteUnit for entity
            if (!deleted && item.category === "Entity") {
                try {
                    await model.domainModels.deleteUnit(item.id);
                    deleted = true;
                    deletedCount++;
                } catch {
                    // Silently fall through
                }
            }
        }

        // If not yet deleted, try document deletion APIs
        if (!deleted) {
            for (const api of documentApis) {
                try {
                    await api.deleteUnit(item.id);
                    deleted = true;
                    deletedCount++;
                    break;
                } catch {
                    // Try next API
                }
            }
        }

        if (!deleted) {
            errors.push(`Could not delete element ${item.id} (${item.category})`);
        }
    }

    return { deletedCount, errors };
}
