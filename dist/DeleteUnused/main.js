import {
  era
} from "./chunk-WA3LWEMV.js";

// src/main/index.ts
var SYSTEM_MODULES = /* @__PURE__ */ new Set([
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
  "FeedbackModule"
]);
var DOCUMENT_TYPE_LABELS = {
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
  "JsonStructures$JsonStructure": "JSON Structure",
  "XmlSchemas$XmlSchema": "XML Schema",
  "Mappings$ImportMapping": "Import Mapping",
  "Mappings$ExportMapping": "Export Mapping",
  "ImportMappings$ImportMapping": "Import Mapping",
  "ExportMappings$ExportMapping": "Export Mapping"
};
var lastScannedItems = /* @__PURE__ */ new Map();
var component = {
  async loaded(componentContext) {
    if (componentContext.runMode === "headless") {
      return;
    }
    const studioPro = era(componentContext);
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
                title: "Unused Elements Finder"
              },
              {
                componentName: "extension/DeleteUnused",
                uiEntrypoint: "tab"
              },
              { isSingleton: true }
            );
          }
        }
      ]
    });
    await studioPro.ui.messagePassing.addMessageHandler(async (messageInfo) => {
      const msg = messageInfo.message;
      if (msg.type === "scan") {
        try {
          const items = await scanForUnusedElements(studioPro);
          lastScannedItems = new Map(items.map((i) => [i.id, i]));
          const response = { type: "scanResult", items };
          await studioPro.ui.messagePassing.sendResponse(messageInfo.messageId, response);
        } catch (err) {
          console.error("[DeleteUnused] Scan error:", err);
          const response = { type: "scanResult", items: [] };
          await studioPro.ui.messagePassing.sendResponse(messageInfo.messageId, response);
        }
      }
      if (msg.type === "delete") {
        let itemsToDelete = [];
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
                isCross: cached.isCross
              };
            }
            return { id, category: "Document" };
          });
        }
        const result = await deleteElements(studioPro, itemsToDelete);
        for (const item of itemsToDelete) {
          lastScannedItems.delete(item.id);
        }
        const response = {
          type: "deleteResult",
          deletedCount: result.deletedCount,
          errors: result.errors
        };
        await studioPro.ui.messagePassing.sendResponse(messageInfo.messageId, response);
      }
    });
  }
};
async function scanForUnusedElements(studioPro) {
  const model = studioPro.app.model;
  const unusedItems = [];
  let allModules = [];
  try {
    allModules = await model.modules.getModules();
  } catch {
    allModules = [];
  }
  const userModules = /* @__PURE__ */ new Set();
  for (const mod of allModules) {
    if (!SYSTEM_MODULES.has(mod.name) && !mod.fromAppStore) {
      userModules.add(mod.name);
    }
  }
  const allDocUnits = [];
  async function collectDocUnits(accessor, typeOverride) {
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
              moduleName
            });
          }
        }
      }
    } catch {
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
    collectDocUnits(model.jsonStructures),
    collectDocUnits(model.xmlSchemas),
    collectDocUnits(model.importMappings),
    collectDocUnits(model.exportMappings)
  ]);
  const candidateEntities = [];
  const candidateAttributes = [];
  const candidateAssociations = [];
  const referencedEntityNames = /* @__PURE__ */ new Set();
  const referencedEntityIds = /* @__PURE__ */ new Set();
  const referencedAttributeNames = /* @__PURE__ */ new Set();
  const referencedAttributeIds = /* @__PURE__ */ new Set();
  const referencedAssociationNames = /* @__PURE__ */ new Set();
  const referencedAssociationIds = /* @__PURE__ */ new Set();
  const referencedDocNames = /* @__PURE__ */ new Set();
  const referencedDocIds = /* @__PURE__ */ new Set();
  for (const modName of userModules) {
    try {
      const dm = await model.domainModels.getDomainModel(modName);
      if (!dm) continue;
      const domainModelId = dm.$ID;
      if (Array.isArray(dm.entities)) {
        for (const entity of dm.entities) {
          const entityQualified = `${modName}.${entity.name}`;
          const gen = entity.generalization?.generalization;
          if (gen && typeof gen === "string") {
            referencedEntityNames.add(gen);
          }
          candidateEntities.push({
            id: entity.$ID,
            name: entity.name,
            qualifiedName: entityQualified,
            moduleName: modName,
            domainModelId,
            generalization: gen
          });
          if (Array.isArray(entity.validationRules)) {
            for (const vr of entity.validationRules) {
              if (vr.attribute) {
                referencedAttributeNames.add(vr.attribute);
                referencedAttributeNames.add(`${entity.name}.${vr.attribute}`);
                referencedAttributeNames.add(`${entityQualified}.${vr.attribute}`);
              }
            }
          }
          if (Array.isArray(entity.indexes)) {
            for (const idx of entity.indexes) {
              if (Array.isArray(idx.attributes)) {
                for (const attr of idx.attributes) {
                  if (typeof attr === "string") {
                    referencedAttributeNames.add(attr);
                    referencedAttributeNames.add(`${entity.name}.${attr}`);
                    referencedAttributeNames.add(`${entityQualified}.${attr}`);
                  }
                }
              }
            }
          }
          if (Array.isArray(entity.attributes)) {
            for (const attr of entity.attributes) {
              let typeLabel = "Attribute";
              if (attr.type && typeof attr.type === "object") {
                const rawType = attr.type.$Type ?? "";
                typeLabel = rawType.replace("DomainModels$", "").replace("AttributeType", "");
              }
              const calcMicroflow = attr.value?.microflow;
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
                entityId: entity.$ID
              });
            }
          }
        }
      }
      const processAssocList = (list, isCross) => {
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
            isCross
          });
        }
      };
      processAssocList(dm.associations, false);
      processAssocList(dm.crossAssociations, true);
    } catch (err) {
      console.error(`[DeleteUnused] Error reading domain model for ${modName}:`, err);
    }
  }
  const loadedUnits = [];
  async function safeLoadAll(accessor) {
    try {
      const units = await accessor.loadAll((u) => userModules.has(u.moduleName ?? ""), 1e3);
      if (Array.isArray(units)) {
        loadedUnits.push(...units);
      }
    } catch {
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
    safeLoadAll(model.menuDocuments)
  ]);
  const visited = /* @__PURE__ */ new WeakSet();
  function extractFromText(text) {
    if (!text || text.length < 2) return;
    for (const ce of candidateEntities) {
      if (text.includes(ce.qualifiedName) || text.includes(ce.name)) {
        referencedEntityNames.add(ce.qualifiedName);
        referencedEntityNames.add(ce.name);
      }
    }
    for (const ca of candidateAssociations) {
      if (text.includes(ca.qualifiedName) || text.includes(ca.name)) {
        referencedAssociationNames.add(ca.qualifiedName);
        referencedAssociationNames.add(ca.name);
      }
    }
    for (const cattr of candidateAttributes) {
      if (text.includes(cattr.qualifiedName) || text.includes(`${cattr.entityName}.${cattr.name}`) || text.includes(`${cattr.entityName}/${cattr.name}`) || text.includes(`/${cattr.name}`) || text.includes(`$${cattr.name}`)) {
        referencedAttributeNames.add(cattr.qualifiedName);
        referencedAttributeNames.add(cattr.name);
      }
    }
    for (const doc of allDocUnits) {
      if (text.includes(`${doc.moduleName}.${doc.name}`) || text.includes(doc.name)) {
        referencedDocNames.add(`${doc.moduleName}.${doc.name}`);
        referencedDocNames.add(doc.name);
      }
    }
  }
  function deepScan(node) {
    if (!node || typeof node !== "object") return;
    if (visited.has(node)) return;
    visited.add(node);
    if (typeof node.entity === "string" && node.entity) {
      referencedEntityNames.add(node.entity);
    }
    if (typeof node.association === "string" && node.association) {
      referencedAssociationNames.add(node.association);
    }
    if (typeof node.attribute === "string" && node.attribute) {
      referencedAttributeNames.add(node.attribute);
    }
    if (typeof node.microflow === "string" && node.microflow) referencedDocNames.add(node.microflow);
    if (typeof node.nanoflow === "string" && node.nanoflow) referencedDocNames.add(node.nanoflow);
    if (typeof node.rule === "string" && node.rule) referencedDocNames.add(node.rule);
    if (typeof node.page === "string" && node.page) referencedDocNames.add(node.page);
    if (typeof node.form === "string" && node.form) referencedDocNames.add(node.form);
    if (typeof node.snippet === "string" && node.snippet) referencedDocNames.add(node.snippet);
    if (typeof node.layout === "string" && node.layout) referencedDocNames.add(node.layout);
    if (typeof node.enumeration === "string" && node.enumeration) referencedDocNames.add(node.enumeration);
    if (typeof node.constant === "string" && node.constant) referencedDocNames.add(node.constant);
    if (node.$Type === "DomainModels$DirectEntityRef" && typeof node.entity === "string") {
      referencedEntityNames.add(node.entity);
    }
    if (node.$Type === "DomainModels$AttributeRef" && typeof node.attribute === "string") {
      referencedAttributeNames.add(node.attribute);
    }
    if (node.$Type === "DomainModels$AssociationRef" && typeof node.association === "string") {
      referencedAssociationNames.add(node.association);
    }
    const stringFields = [
      node.xPathConstraint,
      node.expression,
      node.value,
      node.argument,
      node.template,
      node.initialValue
    ];
    for (const s of stringFields) {
      if (typeof s === "string") {
        extractFromText(s);
      }
    }
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
  for (const unit of loadedUnits) {
    deepScan(unit);
  }
  for (const ca of candidateAssociations) {
    const isAssocReferenced = referencedAssociationNames.has(ca.qualifiedName) || referencedAssociationNames.has(ca.name) || referencedAssociationIds.has(ca.id);
    if (isAssocReferenced) {
      if (ca.parent) referencedEntityNames.add(ca.parent);
      if (ca.child) referencedEntityNames.add(ca.child);
    }
  }
  for (const ce of candidateEntities) {
    const isUsed = referencedEntityNames.has(ce.qualifiedName) || referencedEntityNames.has(ce.name) || referencedEntityIds.has(ce.id);
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
        propertyName: "entities"
      });
    }
  }
  for (const ca of candidateAttributes) {
    const isUsed = referencedAttributeNames.has(ca.qualifiedName) || referencedAttributeNames.has(`${ca.entityName}.${ca.name}`) || referencedAttributeNames.has(`${ca.entityName}/${ca.name}`) || referencedAttributeNames.has(ca.name) || referencedAttributeIds.has(ca.id);
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
        propertyName: "attributes"
      });
    }
  }
  for (const ca of candidateAssociations) {
    const isUsed = referencedAssociationNames.has(ca.qualifiedName) || referencedAssociationNames.has(ca.name) || referencedAssociationIds.has(ca.id);
    if (!isUsed) {
      const relDisplay = ca.parent && ca.child ? `${ca.parent} \u2794 ${ca.child}` : "Association";
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
        isCross: ca.isCross
      });
    }
  }
  const seenDocIds = /* @__PURE__ */ new Set();
  for (const doc of allDocUnits) {
    if (seenDocIds.has(doc.id)) continue;
    seenDocIds.add(doc.id);
    const qualified = `${doc.moduleName}.${doc.name}`;
    const isUsed = referencedDocNames.has(qualified) || referencedDocNames.has(doc.name) || referencedDocIds.has(doc.id);
    if (!isUsed) {
      unusedItems.push({
        id: doc.id,
        name: doc.name,
        category: "Document",
        subType: doc.type,
        moduleName: doc.moduleName,
        containerName: `Document: ${doc.type}`
      });
    }
  }
  const categoryOrder = {
    Entity: 1,
    Attribute: 2,
    Association: 3,
    Document: 4
  };
  return unusedItems.sort((a, b) => {
    if (a.moduleName !== b.moduleName) return a.moduleName.localeCompare(b.moduleName);
    if (categoryOrder[a.category] !== categoryOrder[b.category]) {
      return categoryOrder[a.category] - categoryOrder[b.category];
    }
    return a.name.localeCompare(b.name);
  });
}
async function deleteElements(studioPro, items) {
  const model = studioPro.app.model;
  const errors = [];
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
    model.jsonStructures,
    model.xmlSchemas,
    model.importMappings,
    model.exportMappings
  ];
  for (const item of items) {
    let deleted = false;
    if (item.category !== "Document" && item.domainModelId) {
      try {
        const domainModelApi = model.domainModels;
        if (typeof domainModelApi.applyChanges === "function") {
          await domainModelApi.applyChanges([
            {
              type: "removeElement",
              unitId: item.domainModelId,
              targetId: item.targetId ?? item.domainModelId,
              propertyName: item.propertyName ?? (item.category === "Entity" ? "entities" : "attributes"),
              elementId: item.id
            }
          ]);
          deleted = true;
          deletedCount++;
        }
      } catch (err) {
        console.warn(`[DeleteUnused] applyChanges failed for ${item.id}:`, err);
      }
      if (!deleted) {
        try {
          const dm = await model.domainModels.load("DomainModels$DomainModel", item.domainModelId);
          if (dm) {
            let modified = false;
            if (item.category === "Entity" && Array.isArray(dm.entities)) {
              const originalLen = dm.entities.length;
              dm.entities = dm.entities.filter((e) => e.$ID !== item.id);
              if (dm.entities.length < originalLen) modified = true;
            } else if (item.category === "Attribute" && Array.isArray(dm.entities)) {
              for (const ent of dm.entities) {
                if (Array.isArray(ent.attributes)) {
                  const originalLen = ent.attributes.length;
                  ent.attributes = ent.attributes.filter((a) => a.$ID !== item.id);
                  if (ent.attributes.length < originalLen) {
                    modified = true;
                    break;
                  }
                }
              }
            } else if (item.category === "Association") {
              if (Array.isArray(dm.associations)) {
                const originalLen = dm.associations.length;
                dm.associations = dm.associations.filter((a) => a.$ID !== item.id);
                if (dm.associations.length < originalLen) modified = true;
              }
              if (!modified && Array.isArray(dm.crossAssociations)) {
                const originalLen = dm.crossAssociations.length;
                dm.crossAssociations = dm.crossAssociations.filter((a) => a.$ID !== item.id);
                if (dm.crossAssociations.length < originalLen) modified = true;
              }
            }
            if (modified) {
              await model.domainModels.save(dm);
              deleted = true;
              deletedCount++;
            }
          }
        } catch (err) {
          console.warn(`[DeleteUnused] save domain model failed for ${item.id}:`, err);
        }
      }
      if (!deleted && item.category === "Entity") {
        try {
          await model.domainModels.deleteUnit(item.id);
          deleted = true;
          deletedCount++;
        } catch {
        }
      }
    }
    if (!deleted) {
      for (const api of documentApis) {
        try {
          await api.deleteUnit(item.id);
          deleted = true;
          deletedCount++;
          break;
        } catch {
        }
      }
    }
    if (!deleted) {
      errors.push(`Could not delete element ${item.id} (${item.category})`);
    }
  }
  return { deletedCount, errors };
}
export {
  component
};
//# sourceMappingURL=main.js.map
