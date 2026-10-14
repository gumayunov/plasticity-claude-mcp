

export const findView = `const find = id => {
  for (const [versionId, item] of this.geo.geometryModel) {
    if (this.db.lookupStableId(versionId) === id) return item.view;
  }
  throw new Error('Unknown body ID: ' + id);
};`;

export const findFaceViews = `${findView}
const selectedFaces = args.faces.map(reference => {
  const view = find(reference.bodyId);
  const index = view.high.faces.versionIds.indexOf(reference.faceId);
  if (index < 0) throw new Error('Stale or unknown face: ' + reference.bodyId + ':' + reference.faceId);
  return view.high.faces.get(index);
});`;

export const findEdgeViews = `${findView}
const view = find(args.edges[0].bodyId);
const selectedEdges = args.edges.map(reference => {
  if (reference.bodyId !== args.edges[0].bodyId) throw new Error('Native edge edit requires one body');
  const index = view.high.edges.versionIds.indexOf(reference.edgeId);
  if (index < 0) throw new Error('Stale or unknown edge: ' + reference.bodyId + ':' + reference.edgeId);
  return view.high.edges.get(index);
});`;

export const findCurveControlPoints = `const views = new Map();
for (const bodyId of new Set(args.points.map(point => point.bodyId))) {
  for (const [versionId, item] of this.geo.geometryModel) {
    if (this.db.lookupStableId(versionId) === bodyId && item.view?.constructor?.name === 'Wire') {
      views.set(bodyId, item.view);
      break;
    }
  }
  if (!views.has(bodyId)) throw new Error('Unknown current Wire ID: ' + bodyId);
}
const vertices = [];
const cvs = [];
for (const point of args.points) {
  const view = views.get(point.bodyId);
  const collection = point.kind === 'vertex' ? view.vertices : view.cvs;
  const found = Array.from(collection ?? []).find(candidate => Number(candidate.id) === point.pointId);
  if (!found) throw new Error('Unknown current curve control point: ' + point.bodyId + ':' + point.kind + ':' + point.pointId);
  (point.kind === 'vertex' ? vertices : cvs).push(found);
}`;

export const findWritableInstanceEmpty = `const find = id => {
  const store = this.db.empties.write;
  const original = store.id2empty.get(id);
  if (original?.constructor?.name !== 'InstanceEmpty') throw new Error('Unknown native instance ID: ' + id);
  const copy = original.clone(false);
  copy.versionId = original.versionId;
  copy.targetKey = original.targetKey;
  copy.kind = original.kind;
  store.id2empty.set(id, copy);
  return copy;
};`;

export const commandStart = (commandName: string, factoryName = "Factory") => `
  if (this.executor.isBusy) throw new Error('Plasticity is busy');
  const editor = this;
  let failure;
  const command = new this.commands.${commandName}(this);
  command.remember = false;
  command.execute = async function () {
    try {
      const factory = new ${factoryName}(editor).resource(this);`;

export const commandEnd = `
      return await factory.commit();
    } catch (error) {
      failure = error;
      throw error;
    }
  };
  await this.exec(command);
  if (failure) throw failure;`;
