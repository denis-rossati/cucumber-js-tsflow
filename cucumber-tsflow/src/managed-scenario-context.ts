import * as _ from "underscore";

import { ScenarioContext, ScenarioInfo } from "./scenario-context";
import { ContextType, isProvidedContextType } from "./types";

/**
 * Represents a [[ScenarioContext]] implementation that manages a collection of context objects that
 * are created and used by binding classes during a running Cucumber scenario.
 */
export class ManagedScenarioContext implements ScenarioContext {
  private readonly _scenarioInfo: ScenarioInfo;

  private _activeObjects = new Map<any, any>();

  constructor(scenarioTitle: string, tags: string[]) {
    this._scenarioInfo = new ScenarioInfo(scenarioTitle, tags);
  }

  /**
   * Gets information about the scenario.
   *
   */
  public get scenarioInfo(): ScenarioInfo {
    return this._scenarioInfo;
  }

  public getOrActivateBindingClass(
    targetPrototype: any,
    contextTypes: ContextType[]
  ): any {
    return this.getOrActivateObject(targetPrototype, () => {
      return this.activateBindingClass(targetPrototype, contextTypes);
    });
  }

  public dispose(): void {
    this._activeObjects.forEach((value: any) => {
      if (typeof value.dispose === "function") {
        value.dispose();
      }
    });
  }

  /**
   * @internal
   */
  public addExternalObject(value: unknown) {
    if (value == null) { return; }

    const proto = value.constructor.prototype;

    const existingObject = this._activeObjects.get(proto);

    if (existingObject !== undefined) {
      throw new Error(`Conflicting objects of type "${proto.name}" registered.`);
    }

    this._activeObjects.set(proto, value);
  }

  private activateBindingClass(
    targetPrototype: any,
    contextTypes: ContextType[]
  ): any {
    const invokeBindingConstructor = (args: any[]): any => {
      return new (targetPrototype.constructor as any)(...args);
    };

    const contextObjects = _.map(contextTypes, contextType =>
      this.getOrActivateObject(contextType.prototype, () => {
        if (isProvidedContextType(contextType)) {
          throw new Error(
            `The requested type "${contextType.name}" should be provided by cucumber-tsflow, but was not registered. Please report a bug.`);
        }

        return new contextType();
      })
    );

    return invokeBindingConstructor(contextObjects);
  }

  private getOrActivateObject(
    targetPrototype: any,
    activatorFunc: () => any
  ): any {
    let activeObject = this._activeObjects.get(targetPrototype);

    if (activeObject) {
      return activeObject;
    }

    activeObject = activatorFunc();

    this._activeObjects.set(targetPrototype, activeObject);

    return activeObject;
  }
}

export * from "./scenario-context";
