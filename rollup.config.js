import resolve from "@rollup/plugin-node-resolve";
import sucrase from "@rollup/plugin-sucrase";
export default {
  input: "playground/mc.ts",
  output: {
    dir: "playground",
    format: "es",
  },
  plugins: [
    resolve({ extensions: [".ts", ".js", ".json"] }),
    sucrase({ transforms: ["typescript"] }),
  ],
};
