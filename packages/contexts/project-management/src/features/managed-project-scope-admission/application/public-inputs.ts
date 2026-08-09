import { ids } from "../domain/value-objects.js";
import type {
  CreateProductProjectCommandId,
  ProjectPreparationCommandId,
} from "../domain/value-objects.js";

export type ProjectManagementInputConstructors = Readonly<{
  createCommand(value: string): CreateProductProjectCommandId;
  preparationCommand(value: string): ProjectPreparationCommandId;
}>;

export const projectManagementInputs: ProjectManagementInputConstructors = Object.freeze({
  createCommand: ids.createCommand,
  preparationCommand: ids.preparationCommand,
});
