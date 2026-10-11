// Runs inside the Plasticity renderer with `this` = editor and `compat` resolved from the active profile.
export const STATE_READ_FUNCTION = `function (ConstructionPlaneDatabase, Vector, Quaternion) {
      const mm = value => value * 1000;
      const vector = value => [mm(value.x), mm(value.y), mm(value.z)];
      const direction = value => [value.x, value.y, value.z];
      const stableNumber = value => (Object.is(value, -0) ? 0 : value).toPrecision(12);
      const token = value => {
        let hash = 14695981039346656037n;
        for (let index = 0; index < value.length; index += 1) {
          hash ^= BigInt(value.charCodeAt(index));
          hash = BigInt.asUintN(64, hash * 1099511628211n);
        }
        return hash.toString(16).padStart(16, '0');
      };
      const planeDescriptor = (id, nativeId, source, plane) => ({
        id,
        nativeId: String(nativeId),
        name: String(plane.name ?? id),
        source,
        originMm: vector(plane.p),
        normal: direction(plane.n),
        xDirection: direction(plane.x),
        yDirection: direction(plane.y),
      });
      const standardPlaneEntries = [
        ['top', 'Top'],
        ['bottom', 'Bottom'],
        ['left', 'Left'],
        ['right', 'Right'],
        ['front', 'Front'],
        ['back', 'Back'],
      ];
      const planeRecords = standardPlaneEntries.map(([id, key]) => ({
        object: ConstructionPlaneDatabase[key],
        descriptor: planeDescriptor('standard:' + id, key, 'standard', ConstructionPlaneDatabase[key]),
      }));
      const savedSnapshot = compat.planesSnapshot();
      const savedIdEntries = savedSnapshot.ids instanceof Map
        ? Array.from(savedSnapshot.ids)
        : Object.entries(savedSnapshot.ids ?? {});
      const savedIds = savedIdEntries.map(([index, nativeId]) => [String(nativeId), Number(index)]);
      for (const [nativeId, index] of savedIds) {
        const plane = savedSnapshot.planes?.[index];
        if (plane) planeRecords.push({
          object: plane,
          descriptor: planeDescriptor('plane:' + nativeId, nativeId, 'saved', plane),
        });
      }
      const planes = planeRecords
        .map(record => record.descriptor)
        .sort((left, right) => (left.source + ':' + left.nativeId).localeCompare(right.source + ':' + right.nativeId));
      const planeStateToken = 'planes:' + token(JSON.stringify(planes.map(plane => [
        plane.id,
        plane.nativeId,
        plane.name,
        plane.source,
        ...plane.originMm.map(stableNumber),
        ...plane.normal.map(stableNumber),
        ...plane.xDirection.map(stableNumber),
        ...plane.yDirection.map(stableNumber),
      ])));
      const viewport = Array.from(compat.viewports)[0];
      const active = viewport?.constructionPlane;
      const frameEqual = (left, right) => ['p', 'n', 'x', 'y'].every(key =>
        left?.[key] && right?.[key] && left[key].distanceToSquared(right[key]) <= 1e-24
      );
      const activeRecord = active
        ? (planeRecords.find(record => record.object === active) ?? planeRecords.find(record => frameEqual(record.object, active)))
        : undefined;
      const activePlaneId = activeRecord?.descriptor.id ?? null;
      const activeFrameToken = active
        ? [vector(active.p), direction(active.n), direction(active.x), direction(active.y)].flat().map(stableNumber).join(',')
        : 'none';
      const viewStateToken = ['workplane', activePlaneId ?? 'unregistered', activeFrameToken].join(':');
      // Plasticity's kernel binding never frees the native side of topology
      // wrappers (faces, edges, vertices, collections), even after GC, so
      // every walk of a large document's topology costs hundreds of MB. A
      // body version's topology is immutable: read it once per body view
      // and versionId and reuse it across state reads.
      const topologyCacheKey = Symbol.for('plasticity-mcp.body-topology');
      const topologyCache = globalThis[topologyCacheKey] ?? (globalThis[topologyCacheKey] = new WeakMap());
      const readTopology = (item, bodyType) => {
        const isBrepShell = bodyType === 'Solid' || bodyType === 'Sheet';
        const isWire = bodyType === 'Wire';
        let box = null;
        if (typeof item.model?.FindBox === 'function') {
          if (isWire) {
            try { box = item.model.FindBox(); } catch {}
          } else box = item.model.FindBox();
        }
        // Wire B-curve segments have their own segmentEntityId API. Some
        // Plasticity rebuild results expose transient high-edge views that are
        // not shell B-Rep topology and can make getBoundingBox throw
        // PK_ERROR_not_an_entity. Only Solid/Sheet topology belongs here.
        const faceViews = isBrepShell ? item.view?.high?.faces : null;
        const edgeViews = isBrepShell ? item.view?.high?.edges : null;
        const faceIdByEntity = new Map();
        const edgeIdByEntity = new Map();
        for (let index = 0; index < (faceViews?.versionIds?.length ?? 0); index += 1) {
          const view = faceViews.get(index);
          if (view) faceIdByEntity.set(view.entityId, String(faceViews.versionIds[index]));
        }
        for (let index = 0; index < (edgeViews?.versionIds?.length ?? 0); index += 1) {
          const view = edgeViews.get(index);
          if (view) edgeIdByEntity.set(view.entityId, String(edgeViews.versionIds[index]));
        }
        const modelFaces = isBrepShell ? item.model?.GetFaces?.() : null;
        const faces = [];
        for (let index = 0; index < (modelFaces?.Size?.() ?? 0); index += 1) {
          const face = modelFaces.Get(index);
          const id = faceIdByEntity.get(face.Id());
          if (!id) continue;
          const midpoint = face.FindMidpoint();
          const surface = face.GetSurface();
          if (!faceViews) continue;
          const viewIndex = faceViews.versionIds.indexOf(id);
          const faceView = viewIndex >= 0 ? faceViews.get(viewIndex) : null;
          if (!faceView) continue;
          const faceBox = faceView.getBoundingBox();
          const faceEdges = face.GetEdges();
          const adjacentEdgeIds = [];
          for (let edgeIndex = 0; edgeIndex < faceEdges.Size(); edgeIndex += 1) {
            const adjacentId = edgeIdByEntity.get(faceEdges.Get(edgeIndex).Id());
            if (adjacentId) adjacentEdgeIds.push(adjacentId);
          }
          const radius = face.GetRadius();
          const blendRadius = face.GetBlendRadius();
          const surfaceType = surface.surface?.constructor?.name ?? 'Unknown';
          let axisOriginMm = null;
          let axisDirection = null;
          let coneBasisRadiusMm = null;
          let coneSemiAngleRad = null;
          if (surfaceType === 'Cylinder' || surfaceType === 'Cone') {
            const info = surface.surface.GetInfo?.();
            const basis = info?.basis;
            if (basis?.Location && basis?.Axis) {
              axisOriginMm = vector(basis.Location);
              axisDirection = direction(basis.Axis);
            }
            if (surfaceType === 'Cone' && Number.isFinite(info?.semiAngle)) {
              coneSemiAngleRad = info.semiAngle;
            }
            if (surfaceType === 'Cone' && Number.isFinite(info?.radius) && info.radius > 0) {
              coneBasisRadiusMm = mm(info.radius);
            }
          }
          faces.push({
            id,
            surfaceType,
            planar: face.IsPlanar(),
            centerMm: vector(midpoint.position),
            normal: direction(midpoint.normal),
            radiusMm: Number.isFinite(radius) && radius > 0 ? mm(radius) : null,
            blendRadiusMm: Number.isFinite(blendRadius) && blendRadius >= 0 ? mm(blendRadius) : null,
            axisOriginMm,
            axisDirection,
            ...(coneBasisRadiusMm === null ? {} : { coneBasisRadiusMm }),
            ...(coneSemiAngleRad === null ? {} : { coneSemiAngleRad }),
            boundsMm: { min: vector(faceBox.min), max: vector(faceBox.max) },
            edgeIds: adjacentEdgeIds,
          });
        }
        const modelEdges = isBrepShell ? item.model?.GetEdges?.() : null;
        const edges = [];
        const verticesById = new Map();
        for (let index = 0; index < (modelEdges?.Size?.() ?? 0); index += 1) {
          const edge = modelEdges.Get(index);
          const id = edgeIdByEntity.get(edge.Id());
          if (!id) continue;
          const midpoint = edge.GetPointAndTangent(0.5);
          const length = edge.FindLength();
          const curve = edge.GetCurve();
          const nativeCurve = curve?.curve ?? curve;
          let circleGeometry = null;
          if (edge.IsCircle()) {
            const info = nativeCurve?.GetInfo?.();
            const basis = info?.basis;
            const location = basis?.Location;
            const axis = basis?.Axis;
            const reference = basis?.Ref;
            if (location && axis && reference && Number.isFinite(info?.radius) && info.radius > 0) {
              const start = edge.GetPointAndTangent(0).position;
              const end = edge.GetPointAndTangent(1).position;
              circleGeometry = {
                centerMm: vector(location),
                radiusMm: mm(info.radius),
                normal: direction(axis),
                reference: direction(reference),
                startMm: vector(start),
                midpointMm: vector(midpoint.position),
                endMm: vector(end),
              };
            }
          }
          if (!edgeViews) continue;
          const viewIndex = edgeViews.versionIds.indexOf(id);
          const edgeView = viewIndex >= 0 ? edgeViews.get(viewIndex) : null;
          if (!edgeView) continue;
          const edgeBox = edgeView.getBoundingBox();
          const adjacentFaces = edge.GetFaces();
          const adjacentFaceIds = [];
          for (let faceIndex = 0; faceIndex < adjacentFaces.Size(); faceIndex += 1) {
            const adjacentId = faceIdByEntity.get(adjacentFaces.Get(faceIndex).Id());
            if (adjacentId) adjacentFaceIds.push(adjacentId);
          }
          const vertices = edge.GetVertices();
          for (const vertex of [vertices.left, vertices.right]) {
            const vertexId = vertex?.Id?.();
            if (!Number.isInteger(vertexId) || verticesById.has(vertexId)) continue;
            const vertexEdges = vertex.GetEdges?.();
            const adjacentVertexEdgeIds = [];
            for (let edgeIndex = 0; edgeIndex < (vertexEdges?.Size?.() ?? 0); edgeIndex += 1) {
              const adjacentId = edgeIdByEntity.get(vertexEdges.Get(edgeIndex).Id());
              if (adjacentId) adjacentVertexEdgeIds.push(adjacentId);
            }
            const vertexFaces = vertex.GetFaces?.();
            const adjacentVertexFaceIds = [];
            for (let faceIndex = 0; faceIndex < (vertexFaces?.Size?.() ?? 0); faceIndex += 1) {
              const adjacentId = faceIdByEntity.get(vertexFaces.Get(faceIndex).Id());
              if (adjacentId) adjacentVertexFaceIds.push(adjacentId);
            }
            verticesById.set(vertexId, {
              id: vertexId,
              positionMm: vector(vertex.GetPoint()),
              edgeIds: adjacentVertexEdgeIds.sort(),
              faceIds: adjacentVertexFaceIds.sort(),
            });
          }
          edges.push({
            id,
            curveType: curve.curve?.constructor?.name ?? 'Unknown',
            line: edge.IsLine(),
            circle: edge.IsCircle(),
            lengthMm: mm(length.length),
            centerMm: vector(midpoint.position),
            tangent: direction(midpoint.tangent),
            boundsMm: { min: vector(edgeBox.min), max: vector(edgeBox.max) },
            faceIds: adjacentFaceIds,
            vertexIds: [vertices.left?.Id?.(), vertices.right?.Id?.()].filter(Number.isInteger),
            ...(circleGeometry === null ? {} : { circleGeometry }),
          });
        }
        const faceIds = Array.from(faceViews?.versionIds ?? []).map(String);
        const edgeIds = Array.from(edgeViews?.versionIds ?? []).map(String);
        return {
          boundsMm: box ? { min: vector(box.min), max: vector(box.max) } : null,
          faceIds,
          edgeIds,
          faces,
          edges,
          vertices: Array.from(verticesById.values()).sort((left, right) => left.id - right.id),
        };
      };
      const bodies = [...compat.geometryModel].map(([versionId, item]) => {
        const bodyType = item.view?.constructor?.name ?? 'Unknown';
        const view = item.view !== null && typeof item.view === 'object' ? item.view : null;
        const cached = view ? topologyCache.get(view) : undefined;
        let topology = cached?.versionId === versionId ? cached.topology : null;
        if (!topology) {
          topology = readTopology(item, bodyType);
          if (view) topologyCache.set(view, { versionId, topology });
        }
        const key = compat.nodes?.item2key?.(item.view);
        const name = key === undefined ? null : (compat.nodes?.getName?.(key) ?? null);
        const materialId = key === undefined ? 0 : (compat.nodes?.getMaterialId?.(key) ?? 0);
        return {
          id: compat.lookupStableId(versionId),
          versionId,
          type: bodyType,
          name,
          materialId,
          visible: key === undefined ? true : Boolean(compat.nodes?.isVisible?.(key)),
          hidden: key === undefined ? false : Boolean(compat.nodes?.isHidden?.(key)),
          locked: key === undefined ? false : Boolean(compat.nodes?.isLocked?.(key)),
          ...topology,
        };
      }).filter(item => Number.isInteger(item.id));
      const materials = compat.materialsList().map(([id, info]) => {
        const material = compat.materialsGet(id);
        return {
          id: Number(id),
          name: String(info.name ?? ''),
          colorHex: typeof material.color?.getHexString === 'function' ? '#' + material.color.getHexString() : null,
          roughness: Number.isFinite(material.roughness) ? Number(material.roughness) : null,
          metalness: Number.isFinite(material.metalness) ? Number(material.metalness) : null,
          opacity: Number.isFinite(material.opacity) ? Number(material.opacity) : null,
        };
      }).filter(material => Number.isInteger(material.id)).sort((left, right) => left.id - right.id);
      const measurementTarget = target => {
        if (!target) return null;
        let bodyId = null;
        let topologyType = null;
        let topologyRefId = null;
        let positionMm = null;
        let radiusMm = null;
        for (const [versionId, item] of compat.geometryModel) {
          if (item.model?.Id?.() !== target.bodyId) continue;
          const stableId = compat.lookupStableId(versionId);
          bodyId = Number.isInteger(stableId) ? stableId : null;
          try {
            const vertices = item.model.GetVertices?.();
            for (let index = 0; index < (vertices?.Size?.() ?? 0); index += 1) {
              const vertex = vertices.Get(index);
              if (vertex?.Id?.() !== target.topologyId) continue;
              positionMm = vector(vertex.GetPoint());
              topologyType = 'vertex';
              topologyRefId = Number(vertex.Id());
              break;
            }
          } catch {}
          if (!positionMm) try {
            const edges = item.model.GetEdges?.();
            for (let index = 0; index < (edges?.Size?.() ?? 0); index += 1) {
              const edge = edges.Get(index);
              if (edge?.Id?.() !== target.topologyId) continue;
              positionMm = vector(edge.GetPointAndTangent(0.5).position);
              topologyType = 'edge';
              const edgeViews = item.view?.high?.edges;
              const edgeViewIndex = Array.from({ length: edgeViews?.versionIds?.length ?? 0 }, (_, viewIndex) => viewIndex)
                .find(viewIndex => Number(edgeViews.get(viewIndex)?.entityId) === Number(target.topologyId));
              topologyRefId = edgeViewIndex === undefined ? null : String(edgeViews.versionIds[edgeViewIndex]);
              const circleRadius = edge.IsCircle?.() ? Number(edge.GetCurve?.()?.curve?.GetInfo?.()?.radius) : NaN;
              radiusMm = Number.isFinite(circleRadius) && circleRadius > 0 ? mm(circleRadius) : null;
              break;
            }
          } catch {}
          if (!positionMm) try {
            const faces = item.model.GetFaces?.();
            for (let index = 0; index < (faces?.Size?.() ?? 0); index += 1) {
              const face = faces.Get(index);
              if (face?.Id?.() !== target.topologyId) continue;
              positionMm = vector(face.FindMidpoint().position);
              topologyType = 'face';
              const faceViews = item.view?.high?.faces;
              const faceViewIndex = Array.from({ length: faceViews?.versionIds?.length ?? 0 }, (_, viewIndex) => viewIndex)
                .find(viewIndex => Number(faceViews.get(viewIndex)?.entityId) === Number(target.topologyId));
              topologyRefId = faceViewIndex === undefined ? null : String(faceViews.versionIds[faceViewIndex]);
              break;
            }
          } catch {}
          break;
        }
        return {
          descriptor: { bodyId, topologyId: Number(target.topologyId), landmark: Number(target.landmark), topologyType, topologyRefId, positionMm },
          radiusMm,
        };
      };
      const measurementSnapshot = compat.measurementsSnapshot();
      const measurements = Array.from(measurementSnapshot.repo?.measurements ?? []).map(measurement => {
        const firstTarget = measurementTarget(measurement.target1 ?? measurement.target);
        const secondTarget = measurementTarget(measurement.target2);
        const first = firstTarget?.descriptor ?? null;
        const second = secondTarget?.descriptor ?? null;
        const distanceMm = first?.positionMm && second?.positionMm
          ? Math.hypot(
            second.positionMm[0] - first.positionMm[0],
            second.positionMm[1] - first.positionMm[1],
            second.positionMm[2] - first.positionMm[2],
          )
          : null;
        const radial = measurement.constructor?.name === 'RadialMeasurement';
        const offsetMm = radial ? [] : ['x', 'y', 'z']
          .map(key => measurement.offset?.[key])
          .filter(Number.isFinite)
          .map(mm);
        return {
          id: Number(compat.measurementsLookupStableId(measurement.versionId)),
          versionId: Number(measurement.versionId),
          type: String(measurement.constructor?.name ?? 'Measurement'),
          name: typeof measurement.userData?.name === 'string' ? measurement.userData.name : null,
          measurementSource: 'native-brep',
          first,
          second,
          distanceMm,
          direction: measurement.direction ? direction(measurement.direction) : null,
          normal: measurement.normal ? direction(measurement.normal) : null,
          offsetMm,
          ...(radial ? {
            radiusMm: firstTarget?.radiusMm ?? null,
            diameterMm: Number.isFinite(firstTarget?.radiusMm) ? firstTarget.radiusMm * 2 : null,
          } : {}),
        };
      }).filter(measurement => Number.isInteger(measurement.id)).sort((left, right) => left.id - right.id);
      const instanceSnapshot = compat.empties.snapshot();
      const instanceEmpties = Array.from(instanceSnapshot.empties ?? []);
      const instanceInfos = Array.from(instanceSnapshot.infos ?? []);
      const referenceMeshes = instanceEmpties.map((empty, index) => {
        const info = instanceInfos[index];
        if (!empty || info?.tag !== 'Object') return null;
        const stable = compat.lookupEmptyById(Number(empty.versionId));
        if (stable?.constructor?.name !== 'Empties_ObjectEmpty') return null;
        const sourcePath = String(info.path ?? '');
        const lowerPath = sourcePath.toLowerCase();
        const sourceFormat = lowerPath.endsWith('.stl') ? 'stl' : lowerPath.endsWith('.obj') ? 'obj' : lowerPath.endsWith('.3mf') ? '3mf' : 'unknown';
        const localBox = stable.boundingBox?.clone?.();
        const worldBox = localBox?.applyMatrix4?.(stable.matrixWorld);
        const position = new Vector();
        const rotation = new Quaternion();
        const scale = new Vector();
        stable.matrixWorld.decompose(position, rotation, scale);
        let vertexEntries = 0;
        let triangles = 0;
        stable.traverse?.(node => {
          const geometry = node?.geometry;
          const positions = geometry?.attributes?.position;
          if (!positions || !Number.isFinite(positions.count)) return;
          vertexEntries += Number(positions.count);
          const indexCount = Number(geometry.index?.count);
          triangles += Number.isFinite(indexCount) ? indexCount / 3 : Number(positions.count) / 3;
        });
        const key = compat.nodes?.item2key?.(stable);
        const pathName = sourcePath.split(/[\\/]/).pop() || null;
        return {
          id: Number(stable.versionId),
          type: 'ReferenceMesh',
          name: key === undefined ? pathName : (compat.nodes?.getName?.(key) ?? pathName),
          sourcePath,
          sourceFormat,
          measurementSource: 'reference-mesh',
          boundsMm: worldBox ? { min: vector(worldBox.min), max: vector(worldBox.max) } : null,
          translationMm: vector(position),
          rotationQuaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
          sceneScaleToMeters: direction(scale),
          vertexEntries,
          triangles,
          visible: key === undefined ? Boolean(stable.visible) : Boolean(compat.nodes?.isVisible?.(key)),
          hidden: key === undefined ? !stable.visible : Boolean(compat.nodes?.isHidden?.(key)),
          locked: key === undefined ? false : Boolean(compat.nodes?.isLocked?.(key)),
        };
      }).filter(mesh => mesh && Number.isInteger(mesh.id)).sort((left, right) => left.id - right.id);
      const instances = instanceEmpties.map((empty, index) => {
        const info = instanceInfos[index];
        if (!empty || info?.tag !== 'Instance') return null;
        const targetKey = Number(info.targetKey ?? empty.targetKey);
        const sourceBodyIds = [...compat.geometryModel]
          .filter(([, item]) => compat.nodes?.item2key?.(item.view) === targetKey)
          .map(([versionId]) => Number(compat.lookupStableId(versionId)))
          .filter(Number.isInteger)
          .sort((left, right) => left - right);
        const sourceBodyName = sourceBodyIds
          .map(id => bodies.find(body => body.id === id)?.name)
          .find(name => typeof name === 'string' && name.length > 0) ?? null;
        const position = new Vector();
        const rotation = new Quaternion();
        const scale = new Vector();
        empty.matrixWorld.decompose(position, rotation, scale);
        const matrixWorldMm = Array.from(empty.matrixWorld.elements, Number);
        matrixWorldMm[12] = mm(matrixWorldMm[12]);
        matrixWorldMm[13] = mm(matrixWorldMm[13]);
        matrixWorldMm[14] = mm(matrixWorldMm[14]);
        return {
          id: Number(empty.versionId),
          type: 'Instance',
          targetKey,
          targetName: compat.nodes?.getName?.(targetKey) || sourceBodyName,
          sourceBodyIds,
          translationMm: vector(position),
          rotationQuaternion: [rotation.x, rotation.y, rotation.z, rotation.w],
          scale: direction(scale),
          matrixWorldMm,
          visible: Boolean(compat.nodes?.isVisible?.(compat.nodes.item2key(empty))),
          hidden: Boolean(compat.nodes?.isHidden?.(compat.nodes.item2key(empty))),
          locked: Boolean(compat.nodes?.isLocked?.(compat.nodes.item2key(empty))),
        };
      }).filter(instance => instance && Number.isInteger(instance.id)).sort((left, right) => left.id - right.id);
      const bodyIdByNodeKey = new Map();
      for (const [versionId, item] of compat.geometryModel) {
        const stableId = Number(compat.lookupStableId(versionId));
        if (!Number.isInteger(stableId)) continue;
        bodyIdByNodeKey.set(Number(compat.nodes.item2key(item.view)), stableId);
      }
      const instanceIdByNodeKey = new Map();
      for (const empty of instanceEmpties) {
        if (!empty || empty.constructor?.name !== 'InstanceEmpty') continue;
        instanceIdByNodeKey.set(Number(compat.nodes.item2key(empty)), Number(empty.versionId));
      }
      const referenceMeshIdByNodeKey = new Map();
      for (const empty of instanceEmpties) {
        if (!empty) continue;
        const stable = compat.lookupEmptyById(Number(empty.versionId));
        if (stable?.constructor?.name !== 'Empties_ObjectEmpty') continue;
        referenceMeshIdByNodeKey.set(Number(compat.nodes.item2key(stable)), Number(stable.versionId));
      }
      const groupSnapshot = compat.groups.snapshot();
      const groupIds = Array.from(groupSnapshot.groupIds ?? [], Number);
      const groupChildren = Array.from(groupSnapshot.children ?? [], children => Array.from(children ?? [], Number));
      const groupIdByNodeKey = new Map();
      for (const id of groupIds) {
        const group = compat.groups.lookupById(id);
        if (group) groupIdByNodeKey.set(Number(compat.nodes.item2key(group)), id);
      }
      const groups = groupIds.map((id, index) => {
        const group = compat.groups.lookupById(id);
        if (!group) return null;
        const nodeKey = Number(compat.nodes.item2key(group));
        const childKeys = groupChildren[index] ?? [];
        const childGroupIds = childKeys.map(key => groupIdByNodeKey.get(key)).filter(Number.isInteger).sort((left, right) => left - right);
        const bodyIds = childKeys.map(key => bodyIdByNodeKey.get(key)).filter(Number.isInteger).sort((left, right) => left - right);
        const instanceIds = childKeys.map(key => instanceIdByNodeKey.get(key)).filter(Number.isInteger).sort((left, right) => left - right);
        const referenceMeshIds = childKeys.map(key => referenceMeshIdByNodeKey.get(key)).filter(Number.isInteger).sort((left, right) => left - right);
        const knownKeys = new Set([
          ...childGroupIds.map(childId => Number(compat.nodes.item2key(compat.groups.lookupById(childId)))),
          ...childKeys.filter(key => bodyIdByNodeKey.has(key) || instanceIdByNodeKey.has(key) || referenceMeshIdByNodeKey.has(key)),
        ]);
        return {
          id,
          name: compat.nodes.getName(nodeKey) ?? null,
          parentId: id === 0 ? null : Number(compat.groups.getParentId(nodeKey)),
          childGroupIds,
          bodyIds,
          instanceIds,
          referenceMeshIds,
          otherNodeKeys: childKeys.filter(key => !knownKeys.has(key)).sort((left, right) => left - right),
          visible: Boolean(compat.nodes.isVisible(nodeKey)),
          hidden: Boolean(compat.nodes.isHidden(nodeKey)),
          locked: Boolean(compat.nodes.isLocked(nodeKey)),
        };
      }).filter(group => group && Number.isInteger(group.id)).sort((left, right) => left.id - right.id);
      const activeGroupId = Number(groupSnapshot.currentGroupId ?? 0);
      const wireIdsBySketch = new Map();
      for (const [versionId, item] of compat.geometryModel) {
        if (item.view?.constructor?.name !== 'Wire') continue;
        const stableId = compat.lookupStableId(versionId);
        if (!Number.isInteger(stableId)) continue;
        let basis;
        try { basis = compat.curvesLookup(item.view); } catch { continue; }
        const sketchEntry = Array.from(compat.curvesRead.sketch2basis ?? [])
          .find(([, candidateBasis]) => candidateBasis === basis);
        const sketchId = Number(sketchEntry?.[0]);
        if (!Number.isInteger(sketchId)) continue;
        const ids = wireIdsBySketch.get(sketchId) ?? [];
        ids.push(stableId);
        wireIdsBySketch.set(sketchId, ids);
      }
      const regions = [];
      for (const [versionId, item] of compat.geometryModel) {
        if (!compat.automatics.has(versionId) || item.view?.constructor?.name !== 'SketchIsland') continue;
        let sketchId;
        try { sketchId = Number(compat.getSketchId(item.view)); } catch { continue; }
        if (!Number.isInteger(sketchId)) continue;
        for (let index = 0; index < (item.view.regions?.length ?? 0); index += 1) {
          const region = item.view.regions.get(index);
          if (!region) continue;
          const box = region.getBoundingBox();
          regions.push({
            id: String(region.versionId),
            entityId: Number(region.entityId),
            islandVersionId: versionId,
            sketchId,
            sketchWireIds: [...(wireIdsBySketch.get(sketchId) ?? [])].sort((left, right) => left - right),
            measurementSource: 'render-mesh',
            displayBoundsMm: { min: vector(box.min), max: vector(box.max) },
          });
        }
      }
      regions.sort((left, right) => left.id.localeCompare(right.id));
      const viewports = Array.from(compat.viewports ?? []);
      const sectionsByVersion = new Map();
      for (const viewport of viewports) {
        for (const section of viewport.sections ?? []) {
          if (Number.isInteger(Number(section?.versionId))) sectionsByVersion.set(Number(section.versionId), section);
        }
      }
      const sectionAnalyses = Array.from(sectionsByVersion, ([id, section]) => ({
        id,
        versionId: id,
        name: typeof section.name === 'string' && section.name.length > 0 ? section.name : null,
        originMm: vector(section.position),
        normal: direction(section.plane?.normal).map(value => -value),
        visible: Boolean(section.visible),
        registeredViewportCount: viewports.filter(viewport => viewport.sections?.includes(section)).length,
      })).sort((left, right) => left.id - right.id);
      const documentToken = String(compat.document?.uuid ?? compat.document?.filename ?? 'untitled');
      const dbVersion = Number.isFinite(compat.db?.version) ? compat.db.version : null;
      const undoDepth = compat.history?.undoStack?.length ?? 0;
      const redoDepth = compat.history?.redoStack?.length ?? 0;
      const bodyToken = 'bodies:' + token(bodies.map(x => [x.id, x.versionId, x.materialId, x.visible, x.hidden, x.locked].join(':')).join(','));
      const materialToken = 'materials:' + token(JSON.stringify(materials));
      const measurementToken = 'measurements:' + token(JSON.stringify(measurements));
      const instanceToken = 'instances:' + token(JSON.stringify(instances));
      const referenceMeshToken = 'reference-meshes:' + token(JSON.stringify(referenceMeshes));
      const sectionToken = 'sections:' + token(JSON.stringify(sectionAnalyses));
      const groupToken = 'groups:' + token(JSON.stringify([activeGroupId, groups]));
      const revision = [documentToken, dbVersion, undoDepth, redoDepth, bodyToken, planeStateToken, materialToken, measurementToken, instanceToken, referenceMeshToken, sectionToken, groupToken].join('|');
      return {
        documentToken,
        revision,
        dbVersion,
        undoDepth,
        redoDepth,
        materials,
        measurements,
        sectionAnalyses,
        instances,
        referenceMeshes,
        activeGroupId,
        groups,
        construction: { planes, activePlaneId, planeStateToken, viewStateToken },
        regions,
        bodies,
      };
    }`;
