// How far everything drawn in the cell grid stands above the ground under
// it: the vehicles, the frog, the fit outline and the piece waiting in a
// pull-off. It leaves room under the cells for a vehicle's wheels, and the
// frog's legs, to reach down to the road. It is purely visual: the rules know
// nothing of it, and a cell's row counts up from the top of the clearance.
export const GROUND_CLEARANCE = 0.25;
