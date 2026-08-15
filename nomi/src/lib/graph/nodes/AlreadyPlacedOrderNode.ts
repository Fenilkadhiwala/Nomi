import { State } from "../state";

export function alreadyPlacedNode(state: State): Partial<State> {
  return {
    lastResponse: `That order's already placed. Want to start a new order?`,
  };
}
