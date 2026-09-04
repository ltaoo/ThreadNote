import { register } from "node:module";

register("./import-map-loader.mjs", import.meta.url);
