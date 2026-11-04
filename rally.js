import {readFileSync} from 'node:fs';
import {makePhysics} from './public/physics.js';
export const {points,length,width,notes}=JSON.parse(readFileSync(new URL('./track.json',import.meta.url)));
export const {Car,point}=makePhysics({points,length,width});
