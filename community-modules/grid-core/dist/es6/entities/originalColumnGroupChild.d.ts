// Type definitions for @ag-community/grid-core v22.0.0-beta.0
// Project: http://www.ag-grid.com/
// Definitions by: Niall Crosby <https://github.com/ag-grid/>
import { OriginalColumnGroup } from "./originalColumnGroup";
export interface OriginalColumnGroupChild {
    isVisible(): boolean;
    getColumnGroupShow(): string | undefined;
    getId(): string;
    setOriginalParent(originalParent: OriginalColumnGroup | null): void;
}