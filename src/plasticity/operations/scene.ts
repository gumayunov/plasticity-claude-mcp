import { LONG_NATIVE_IMPORT_TIMEOUT_MS, type RuntimeState } from "../runtime.ts";
import { normalize } from "../construction.ts";
import { degreesToRadians } from "../units.ts";
import { type EdgeReference, type FaceReference } from "../measurements.ts";
import { type Vector3, type PlasticitySelection, type CurveControlPointReference, type AppearanceMaterialInput } from "./types.ts";
import { findView, findCurveControlPoints, findWritableInstanceEmpty, commandStart, commandEnd } from "./native-snippets.ts";
import { toMeters, requireInstanceIds, requireReferenceMeshIds, requireGroupIds, requireGroupSelection, requireWireBodyIds, groupContains, requireTopologySelection } from "./helpers.ts";
import { OperationsBase } from "./base.ts";
import type { CurveQueryOperations } from "./curve-query.ts";

export abstract class SceneOperations extends OperationsBase {
  declare assertCurveControlPointReferences: CurveQueryOperations["assertCurveControlPointReferences"];
  async listInstances(): Promise<{
    documentToken: string;
    revision: string;
    instances: NonNullable<RuntimeState["instances"]>;
  }> {
    const state = await this.state();
    return { documentToken: state.documentToken, revision: state.revision, instances: state.instances ?? [] };
  }

  async createInstance(bodyId: number, translationMm: Vector3, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (!state.bodies.some((body) => body.id === bodyId)) throw new Error(`Unknown current body ID: ${bodyId}`);
    await this.runtime.mutate(`async function (CreateFactory, MoveFactory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const create = new CreateFactory(editor).resource(this);
          create.items = [find(args.bodyId)];
          const result = await create.commit();
          const created = Array.isArray(result) ? result : [result].filter(Boolean);
          if (created.length !== 1 || created[0]?.constructor?.name !== 'InstanceEmpty') {
            throw new Error('Plasticity did not create exactly one native instance');
          }
          if (args.translation.some(value => value !== 0)) {
            const move = new MoveFactory(editor).resource(this);
            move.empties = created;
            move.move.fromArray(args.translation);
            await move.commit();
          }
          return created;
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["CreateInstanceFactory", "MoveItemAndEmptyFactory"], [{ bodyId, translation: toMeters(translationMm) }]);
    return await this.state();
  }

  async duplicateBodies(ids: number[], translationMm: Vector3, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    if (ids.length === 0 || new Set(ids).size !== ids.length) {
      throw new Error("Body IDs must be a nonempty unique list");
    }
    const current = new Map(state.bodies.map((body) => [body.id, body]));
    const missing = ids.filter((id) => !current.has(id));
    if (missing.length > 0) throw new Error(`Unknown current body IDs: ${missing.join(", ")}`);
    const invalid = ids.filter((id) => !["Solid", "Sheet"].includes(current.get(id)!.type));
    if (invalid.length > 0) throw new Error(`Body duplication requires current Solid or Sheet bodies: ${invalid.join(", ")}`);
    const translation = toMeters(translationMm);
    await this.runtime.mutate(`async function (CreateFactory, MoveFactory, RealizeFactory, args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          const create = new CreateFactory(editor).resource(this);
          create.items = args.ids.map(find);
          const result = await create.commit();
          const created = Array.isArray(result) ? result : [result].filter(Boolean);
          if (created.length === 0 || !created.every(item => item?.constructor?.name === 'InstanceEmpty')) {
            throw new Error('Plasticity did not create native instances for the complete body selection');
          }
          if (args.translation.some(value => value !== 0)) {
            const move = new MoveFactory(editor).resource(this);
            move.empties = created;
            move.move.fromArray(args.translation);
            await move.commit();
          }
          const realize = new RealizeFactory(editor).resource(this);
          realize.empties = created;
          return await realize.commit();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["CreateInstanceFactory", "MoveItemAndEmptyFactory", "RealizeInstanceFactory"], [{ ids, translation }]);
    return await this.state();
  }

  async moveInstances(ids: number[], deltaMm: Vector3, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireInstanceIds(state, ids);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findWritableInstanceEmpty}
      ${commandStart("MoveItemCommand")}
      factory.empties = args.ids.map(find);
      factory.move.fromArray(args.delta);
      ${commandEnd}
    }`, ["MoveItemAndEmptyFactory"], [{ ids, delta: toMeters(deltaMm) }]);
    return await this.state();
  }

  async rotateInstances(ids: number[], pivotMm: Vector3, axis: Vector3, degrees: number, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireInstanceIds(state, ids);
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      ${findWritableInstanceEmpty}
      ${commandStart("RotateItemCommand")}
      factory.empties = args.ids.map(find);
      factory.pivot.fromArray(args.pivot);
      factory.rotation.copy(new Quaternion().setFromAxisAngle(new Vector(...args.axis).normalize(), args.radians));
      ${commandEnd}
    }`, ["RotateItemAndEmptyFactory", "Vector3", "Quaternion"], [{ ids, pivot: toMeters(pivotMm), axis, radians: degreesToRadians(degrees) }]);
    return await this.state();
  }

  async scaleInstances(ids: number[], pivotMm: Vector3, factors: Vector3, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireInstanceIds(state, ids);
    await this.runtime.mutate(`async function (Factory, args) {
      ${findWritableInstanceEmpty}
      ${commandStart("ScaleItemCommand")}
      factory.empties = args.ids.map(find);
      factory.pivot.fromArray(args.pivot);
      factory.scale.fromArray(args.factors);
      ${commandEnd}
    }`, ["ProjectingScaleItemAndEmptyFactory"], [{ ids, pivot: toMeters(pivotMm), factors }]);
    return await this.state();
  }

  async realizeInstances(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireInstanceIds(state, ids);
    await this.runtime.mutate(`async function (Factory, args) {
      const find = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'InstanceEmpty') throw new Error('Unknown native instance ID: ' + id);
        return empty;
      };
      ${commandStart("GroupSelectedCommand")}
      factory.empties = args.ids.map(find);
      ${commandEnd}
    }`, ["RealizeInstanceFactory"], [{ ids }]);
    return await this.state();
  }

  async deleteInstances(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireInstanceIds(state, ids);
    await this.runtime.mutate(`async function (args) {
      const find = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'InstanceEmpty') throw new Error('Unknown native instance ID: ' + id);
        return empty;
      };
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      this.selection.selected.removeAll();
      for (const empty of args.ids.map(find)) this.selection.selected.addEmpty(empty);
      const command = new this.commands.DeleteCommand(this);
      command.remember = false;
      let failure;
      const execute = command.execute.bind(command);
      command.execute = async function () {
        try { return await execute(); }
        catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, [], [{ ids }]);
    return await this.state();
  }

  async listReferenceMeshes(): Promise<{
    documentToken: string;
    revision: string;
    referenceMeshes: NonNullable<RuntimeState["referenceMeshes"]>;
  }> {
    const state = await this.state();
    return {
      documentToken: state.documentToken,
      revision: state.revision,
      referenceMeshes: state.referenceMeshes ?? [],
    };
  }

  async moveReferenceMeshes(ids: number[], deltaMm: Vector3, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireReferenceMeshIds(state, ids);
    await this.runtime.mutate(`async function (Factory, args) {
      const find = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'Empties_ObjectEmpty') throw new Error('Unknown native reference mesh ID: ' + id);
        return empty;
      };
      ${commandStart("MoveItemCommand")}
      factory.empties = args.ids.map(find);
      factory.move.fromArray(args.delta);
      ${commandEnd}
    }`, ["MoveItemAndEmptyFactory"], [{ ids, delta: toMeters(deltaMm) }]);
    return await this.state();
  }

  async rotateReferenceMeshes(ids: number[], pivotMm: Vector3, axis: Vector3, degrees: number, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireReferenceMeshIds(state, ids);
    const unitAxis = normalize(axis, "Reference mesh rotation axis");
    await this.runtime.mutate(`async function (Factory, Vector, Quaternion, args) {
      const find = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'Empties_ObjectEmpty') throw new Error('Unknown native reference mesh ID: ' + id);
        return empty;
      };
      ${commandStart("RotateItemCommand")}
      factory.empties = args.ids.map(find);
      factory.pivot.fromArray(args.pivot);
      factory.rotation.copy(new Quaternion().setFromAxisAngle(new Vector(...args.axis), args.radians));
      ${commandEnd}
    }`, ["RotateItemAndEmptyFactory", "Vector3", "Quaternion"], [{ ids, pivot: toMeters(pivotMm), axis: unitAxis, radians: degreesToRadians(degrees) }]);
    return await this.state();
  }

  async scaleReferenceMeshes(ids: number[], pivotMm: Vector3, factors: Vector3, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireReferenceMeshIds(state, ids);
    if (factors.some((factor) => !Number.isFinite(factor) || factor <= 0)) {
      throw new Error("Reference mesh scale factors must be positive finite values");
    }
    await this.runtime.mutate(`async function (Factory, args) {
      const find = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'Empties_ObjectEmpty') throw new Error('Unknown native reference mesh ID: ' + id);
        return empty;
      };
      ${commandStart("ScaleItemCommand")}
      factory.empties = args.ids.map(find);
      factory.pivot.fromArray(args.pivot);
      factory.scale.fromArray(args.factors);
      ${commandEnd}
    }`, ["ProjectingScaleItemAndEmptyFactory"], [{ ids, pivot: toMeters(pivotMm), factors }]);
    return await this.state();
  }

  async deleteReferenceMeshes(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireReferenceMeshIds(state, ids);
    await this.runtime.mutate(`async function (args) {
      const find = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'Empties_ObjectEmpty') throw new Error('Unknown native reference mesh ID: ' + id);
        return empty;
      };
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      this.selection.selected.removeAll();
      for (const empty of args.ids.map(find)) this.selection.selected.addEmpty(empty);
      const command = new this.commands.DeleteCommand(this);
      command.remember = false;
      let failure;
      const execute = command.execute.bind(command);
      command.execute = async function () {
        try { return await execute(); }
        catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, [], [{ ids }]);
    return await this.state();
  }

  async renameReferenceMesh(id: number, name: string, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireReferenceMeshIds(state, [id]);
    await this.runtime.mutate(`async function (args) {
      const empty = this.db.lookupEmptyById(args.id);
      if (empty?.constructor?.name !== 'Empties_ObjectEmpty') throw new Error('Unknown native reference mesh ID: ' + args.id);
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      this.selection.selected.removeAll();
      const editor = this;
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try { editor.db.nodes.setName(editor.db.nodes.item2key(empty), args.name); }
        catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, [], [{ id, name }]);
    return await this.state();
  }

  async listGroups(): Promise<{
    documentToken: string;
    revision: string;
    activeGroupId: number;
    groups: NonNullable<RuntimeState["groups"]>;
  }> {
    const state = await this.state();
    return {
      documentToken: state.documentToken,
      revision: state.revision,
      activeGroupId: state.activeGroupId ?? 0,
      groups: state.groups ?? [],
    };
  }

  async createGroup(
    bodyIds: number[],
    instanceIds: number[],
    referenceMeshIds: number[],
    groupIds: number[],
    name: string | undefined,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireGroupSelection(state, bodyIds, instanceIds, referenceMeshIds, groupIds);
    await this.runtime.mutate(`async function (args) {
      ${findView}
      const findEmpty = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'InstanceEmpty') throw new Error('Unknown native instance ID: ' + id);
        return empty;
      };
      const findReferenceMesh = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'Empties_ObjectEmpty') throw new Error('Unknown native reference mesh ID: ' + id);
        return empty;
      };
      const findGroup = id => {
        const group = this.db.groups.lookupById(id);
        if (!group || id === 0) throw new Error('Unknown or protected group ID: ' + id);
        return group;
      };
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      this.selection.selected.removeAll();
      for (const view of args.bodyIds.map(find)) this.selection.selected.add(view);
      for (const empty of args.instanceIds.map(findEmpty)) this.selection.selected.addEmpty(empty);
      for (const empty of args.referenceMeshIds.map(findReferenceMesh)) this.selection.selected.addEmpty(empty);
      for (const group of args.groupIds.map(findGroup)) this.selection.selected.addGroup(group);
      const editor = this;
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      const execute = command.execute.bind(command);
      command.execute = async function () {
        try {
          const result = await execute();
          const selected = Array.from(editor.selection.selected.groups);
          if (selected.length !== 1) throw new Error('Plasticity did not create exactly one group');
          if (args.name) editor.db.nodes.setName(editor.db.nodes.item2key(selected[0]), args.name);
          return result;
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, [], [{ bodyIds, instanceIds, referenceMeshIds, groupIds, name: name ?? null }]);
    return await this.state();
  }

  async moveToGroup(
    bodyIds: number[],
    instanceIds: number[],
    referenceMeshIds: number[],
    groupIds: number[],
    destinationGroupId: number,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireGroupSelection(state, bodyIds, instanceIds, referenceMeshIds, groupIds);
    requireGroupIds(state, [destinationGroupId], true);
    for (const groupId of groupIds) {
      if (groupId === destinationGroupId || groupContains(state, groupId, destinationGroupId)) {
        throw new Error(`Moving group ${groupId} to ${destinationGroupId} would create a group cycle`);
      }
    }
    await this.runtime.mutate(`async function (Command, args) {
      ${findView}
      const findEmpty = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'InstanceEmpty') throw new Error('Unknown native instance ID: ' + id);
        return empty;
      };
      const findReferenceMesh = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'Empties_ObjectEmpty') throw new Error('Unknown native reference mesh ID: ' + id);
        return empty;
      };
      const findGroup = id => {
        const group = this.db.groups.lookupById(id);
        if (!group) throw new Error('Unknown group ID: ' + id);
        return group;
      };
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      this.selection.selected.removeAll();
      for (const view of args.bodyIds.map(find)) this.selection.selected.add(view);
      for (const empty of args.instanceIds.map(findEmpty)) this.selection.selected.addEmpty(empty);
      for (const empty of args.referenceMeshIds.map(findReferenceMesh)) this.selection.selected.addEmpty(empty);
      for (const group of args.groupIds.map(findGroup)) this.selection.selected.addGroup(group);
      let failure;
      const command = new Command(this, findGroup(args.destinationGroupId));
      command.remember = false;
      const execute = command.execute.bind(command);
      command.execute = async function () {
        try { return await execute(); }
        catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["MoveSelectionToGroupCommand"], [{ bodyIds, instanceIds, referenceMeshIds, groupIds, destinationGroupId }]);
    return await this.state();
  }

  async renameGroup(id: number, name: string, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireGroupIds(state, [id], false);
    await this.runtime.mutate(`async function (args) {
      const group = this.db.groups.lookupById(args.id);
      if (!group || args.id === 0) throw new Error('Unknown or protected group ID: ' + args.id);
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      this.selection.selected.removeAll();
      const editor = this;
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try { editor.db.nodes.setName(editor.db.nodes.item2key(group), args.name); }
        catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, [], [{ id, name }]);
    return await this.state();
  }

  async activateGroup(id: number, revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireGroupIds(state, [id], true);
    await this.runtime.mutate(`async function (Command, args) {
      const group = this.db.groups.lookupById(args.id);
      if (!group) throw new Error('Unknown group ID: ' + args.id);
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      let failure;
      const command = new Command(this, group);
      command.remember = false;
      const execute = command.execute.bind(command);
      command.execute = async function () {
        try { return await execute(); }
        catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["ActivateGroupCommand"], [{ id }]);
    return await this.state();
  }

  async dissolveGroups(ids: number[], revision: string): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireGroupIds(state, ids, false);
    await this.runtime.mutate(`async function (Command, args) {
      const find = id => {
        const group = this.db.groups.lookupById(id);
        if (!group || id === 0) throw new Error('Unknown or protected group ID: ' + id);
        return group;
      };
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      this.selection.selected.removeAll();
      for (const group of args.ids.map(find)) this.selection.selected.addGroup(group);
      let failure;
      const command = new Command(this);
      command.remember = false;
      const execute = command.execute.bind(command);
      command.execute = async function () {
        try { return await execute(); }
        catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, ["DissolveGroupCommand"], [{ ids }]);
    return await this.state();
  }

  async setNodeVisibility(
    bodyIds: number[],
    instanceIds: number[],
    referenceMeshIds: number[],
    groupIds: number[],
    visible: boolean,
    revision: string,
  ): Promise<RuntimeState> {
    return await this.setNodeFlag("visibility", bodyIds, instanceIds, referenceMeshIds, groupIds, visible, revision);
  }

  async setNodeLocked(
    bodyIds: number[],
    instanceIds: number[],
    referenceMeshIds: number[],
    groupIds: number[],
    locked: boolean,
    revision: string,
  ): Promise<RuntimeState> {
    return await this.setNodeFlag("locked", bodyIds, instanceIds, referenceMeshIds, groupIds, locked, revision);
  }

  async setNodeFlag(
    flag: "visibility" | "locked",
    bodyIds: number[],
    instanceIds: number[],
    referenceMeshIds: number[],
    groupIds: number[],
    value: boolean,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.assertRevision(revision);
    requireGroupSelection(state, bodyIds, instanceIds, referenceMeshIds, groupIds, true);
    await this.runtime.mutate(`async function (args) {
      ${findView}
      const findEmpty = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'InstanceEmpty') throw new Error('Unknown native instance ID: ' + id);
        return empty;
      };
      const findReferenceMesh = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'Empties_ObjectEmpty') throw new Error('Unknown native reference mesh ID: ' + id);
        return empty;
      };
      const findGroup = id => {
        const group = this.db.groups.lookupById(id);
        if (!group) throw new Error('Unknown group ID: ' + id);
        return group;
      };
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const keys = [
        ...args.bodyIds.map(id => this.db.nodes.item2key(find(id))),
        ...args.instanceIds.map(id => this.db.nodes.item2key(findEmpty(id))),
        ...args.referenceMeshIds.map(id => this.db.nodes.item2key(findReferenceMesh(id))),
        ...args.groupIds.map(id => this.db.nodes.item2key(findGroup(id))),
      ];
      this.selection.selected.removeAll();
      const editor = this;
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try {
          for (const key of keys) {
            if (args.flag === 'visibility') editor.db.nodes.setVisible(key, args.value);
            else editor.db.nodes.setLocked(key, args.value);
          }
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, [], [{ flag, bodyIds, instanceIds, referenceMeshIds, groupIds, value }]);
    return await this.state();
  }

  async selectBodies(ids: number[], revision: string): Promise<PlasticitySelection> {
    return await this.selectNodes(ids, [], [], [], revision);
  }

  async selectCurves(ids: number[], revision: string): Promise<PlasticitySelection> {
    const state = await this.assertRevision(revision);
    requireWireBodyIds(state, ids);
    await this.runtime.read(`function (args) {
      ${findView}
      this.selection.selected.removeAll();
      for (const id of args.ids) this.selection.selected.addCurve(find(id));
    }`, [{ ids }]);
    return await this.selection();
  }

  async selectReferenceMeshes(ids: number[], revision: string): Promise<PlasticitySelection> {
    const state = await this.assertRevision(revision);
    requireReferenceMeshIds(state, ids);
    await this.runtime.read(`function (args) {
      const find = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'Empties_ObjectEmpty') throw new Error('Unknown native reference mesh ID: ' + id);
        return empty;
      };
      this.selection.selected.removeAll();
      for (const empty of args.ids.map(find)) this.selection.selected.addEmpty(empty);
    }`, [{ ids }]);
    return await this.selection();
  }

  async selectNodes(bodyIds: number[], instanceIds: number[], referenceMeshIds: number[], groupIds: number[], revision: string): Promise<PlasticitySelection> {
    const state = await this.assertRevision(revision);
    requireGroupSelection(state, bodyIds, instanceIds, referenceMeshIds, groupIds, true);
    await this.runtime.read(`function (args) {
      ${findView}
      const findEmpty = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'InstanceEmpty') throw new Error('Unknown native instance ID: ' + id);
        return empty;
      };
      const findReferenceMesh = id => {
        const empty = this.db.lookupEmptyById(id);
        if (empty?.constructor?.name !== 'Empties_ObjectEmpty') throw new Error('Unknown native reference mesh ID: ' + id);
        return empty;
      };
      const findGroup = id => {
        const group = this.db.groups.lookupById(id);
        if (!group) throw new Error('Unknown group ID: ' + id);
        return group;
      };
      this.selection.selected.removeAll();
      for (const view of args.bodyIds.map(find)) this.selection.selected.add(view);
      for (const empty of args.instanceIds.map(findEmpty)) this.selection.selected.addEmpty(empty);
      for (const empty of args.referenceMeshIds.map(findReferenceMesh)) this.selection.selected.addEmpty(empty);
      for (const group of args.groupIds.map(findGroup)) this.selection.selected.addGroup(group);
    }`, [{ bodyIds, instanceIds, referenceMeshIds, groupIds }]);
    return await this.selection();
  }

  async selectFaces(references: FaceReference[], revision: string): Promise<PlasticitySelection> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "face");
    await this.runtime.read(`function (args) {
      ${findView}
      this.selection.selected.removeAll();
      for (const reference of args.references) {
        const view = find(reference.bodyId);
        const index = view.high.faces.versionIds.indexOf(reference.faceId);
        if (index < 0) throw new Error('Unknown current face ID: ' + reference.faceId);
        this.selection.selected.addFace(view.high.faces.get(index));
      }
    }`, [{ references }]);
    return await this.selection();
  }

  async selectEdges(references: EdgeReference[], revision: string): Promise<PlasticitySelection> {
    const state = await this.assertRevision(revision);
    requireTopologySelection(state, references, "edge");
    await this.runtime.read(`function (args) {
      ${findView}
      this.selection.selected.removeAll();
      for (const reference of args.references) {
        const view = find(reference.bodyId);
        const index = view.high.edges.versionIds.indexOf(reference.edgeId);
        if (index < 0) throw new Error('Unknown current edge ID: ' + reference.edgeId);
        this.selection.selected.addEdge(view.high.edges.get(index));
      }
    }`, [{ references }]);
    return await this.selection();
  }

  async selectCurveControlPoints(references: CurveControlPointReference[], revision: string): Promise<PlasticitySelection> {
    await this.assertCurveControlPointReferences(references, revision);
    await this.runtime.read(`function (args) {
      ${findCurveControlPoints}
      this.selection.selected.removeAll();
      for (const vertex of vertices) this.selection.selected.addVertex(vertex);
      for (const controlPoint of cvs) this.selection.selected.addCurveCV(controlPoint);
    }`, [{ points: references }]);
    return await this.selection();
  }

  async listAppearanceMaterials(): Promise<{
    documentToken: string;
    revision: string;
    materials: NonNullable<RuntimeState["materials"]>;
    assignments: Array<{ bodyId: number; materialId: number }>;
  }> {
    const state = await this.state();
    return {
      documentToken: state.documentToken,
      revision: state.revision,
      materials: state.materials ?? [],
      assignments: state.bodies.map((body) => ({ bodyId: body.id, materialId: body.materialId ?? 0 })),
    };
  }

  async setAppearanceMaterial(
    ids: number[],
    material: AppearanceMaterialInput,
    revision: string,
  ): Promise<RuntimeState> {
    const state = await this.state();
    if (state.revision !== revision) {
      throw new Error(`Stale reference: expected revision ${revision}, current revision is ${state.revision}`);
    }
    if (ids.length === 0) throw new Error("At least one body ID is required");
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length) throw new Error("Appearance body IDs must be unique");
    const missing = uniqueIds.filter((id) => !state.bodies.some((body) => body.id === id));
    if (missing.length > 0) throw new Error(`Appearance requires current body IDs: ${missing.join(", ")}`);
    if ("materialId" in material) {
      if (!Number.isInteger(material.materialId) || material.materialId < 0) {
        throw new Error("Appearance material ID must be a nonnegative integer");
      }
      if (material.materialId !== 0 && !(state.materials ?? []).some((item) => item.id === material.materialId)) {
        throw new Error(`Unknown current appearance material: ${material.materialId}`);
      }
    } else {
      if (!material.name.trim()) throw new Error("Appearance material name is required");
      if (!/^#[0-9a-fA-F]{6}$/.test(material.colorHex)) throw new Error("Appearance color must be #RRGGBB");
      for (const [name, value] of [["roughness", material.roughness], ["metalness", material.metalness], ["opacity", material.opacity]] as const) {
        if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`Appearance ${name} must be between 0 and 1`);
      }
    }
    await this.runtime.mutate(`async function (args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const views = args.ids.map(find);
      this.selection.selected.removeAll();
      let failure;
      let ran = false;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        ran = true;
        try {
          let materialId = args.material.materialId;
          if (materialId === undefined) {
            const appearance = editor.db.materials.default.clone();
            appearance.color.set(args.material.colorHex);
            appearance.roughness = args.material.roughness;
            appearance.metalness = args.material.metalness;
            appearance.opacity = args.material.opacity;
            appearance.transparent = args.material.opacity < 1;
            materialId = editor.db.materials.add(args.material.name, appearance);
          } else if (materialId !== 0 && !editor.db.materials.has(materialId)) {
            throw new Error('Appearance material ID is no longer current: ' + materialId);
          }
          for (const view of views) editor.db.nodes.setMaterial(editor.db.nodes.item2key(view), materialId);
        } catch (error) {
          failure = error;
          throw error;
        }
      };
      await this.exec(command);
      if (failure) throw failure;
      if (!ran) throw new Error('Appearance command did not execute');
    }`, [], [{ ids: uniqueIds, material }]);
    return await this.state();
  }

  async rename(id: number, name: string, revision: string): Promise<RuntimeState> {
    await this.assertRevision(revision);
    await this.runtime.mutate(`async function (args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const view = find(args.id);
      this.selection.selected.removeAll();
      let failure;
      const command = new this.commands.GroupSelectedCommand(this);
      command.remember = false;
      command.execute = async function () {
        try { editor.db.nodes.setName(editor.db.nodes.item2key(view), args.name); }
        catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, [], [{ id, name }]);
    return await this.state();
  }

  async remove(ids: number[], revision: string): Promise<RuntimeState> {
    if (ids.length === 0 || new Set(ids).size !== ids.length) throw new Error("Delete needs nonempty unique body IDs");
    const before = await this.assertRevision(revision);
    const known = new Set(before.bodies.map((body) => body.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) throw new Error(`Unknown current body IDs: ${missing.join(", ")}`);
    // Plasticity's DeleteCommand deletes whatever is selected when it runs. Exec can interrupt a
    // user's active command, which restores that command's own selection (for example a face), so
    // the selection is set inside execute, right before the native delete, and checked there.
    await this.runtime.mutate(`async function (args) {
      ${findView}
      if (this.executor.isBusy) throw new Error('Plasticity is busy');
      const editor = this;
      const views = args.ids.map(find);
      const command = new this.commands.DeleteCommand(this);
      command.remember = false;
      let failure;
      const execute = command.execute.bind(command);
      command.execute = async function () {
        try {
          const selected = editor.selection.selected;
          selected.removeAll();
          for (const view of views) selected.add(view);
          const items = selected.solidIds.size + selected.sheetIds.size + selected.curveIds.size;
          const other = selected.faceIds.size + selected.edgeIds.size + selected.regionIds.size + selected.segmentIds.size
            + selected.curveVertexIds.size + selected.curveCvIds.size + selected.shellCvIds.size + selected.groupIds.size
            + selected.emptyIds.size + selected.measurementIds.size + selected.planeIds.size;
          if (items !== args.ids.length || other !== 0) throw new Error('Selection for delete is not exactly the requested bodies');
          return await execute();
        } catch (error) { failure = error; throw error; }
      };
      await this.exec(command);
      if (failure) throw failure;
    }`, [], [{ ids }], LONG_NATIVE_IMPORT_TIMEOUT_MS);
    const after = await this.state(LONG_NATIVE_IMPORT_TIMEOUT_MS);
    const remaining = new Map(after.bodies.map((body) => [body.id, body]));
    const notRemoved = ids.filter((id) => remaining.has(id));
    const changed = before.bodies.filter((body) => !ids.includes(body.id)).filter((body) => {
      const current = remaining.get(body.id);
      return !current || current.versionId !== body.versionId || current.type !== body.type;
    }).map((body) => body.id);
    const added = after.bodies.filter((body) => !known.has(body.id)).map((body) => body.id);
    if (notRemoved.length > 0 || changed.length > 0 || added.length > 0) {
      await this.runtime.mutate(`async function () { await this.undo(); }`, [], [], LONG_NATIVE_IMPORT_TIMEOUT_MS);
      throw new Error(`Delete changed more than the requested bodies and was undone (not removed: ${notRemoved.join(", ") || "none"}; changed: ${changed.join(", ") || "none"}; added: ${added.join(", ") || "none"})`);
    }
    return after;
  }
}
