# Simulizer

**Simulizer** is a browser-based visual programming IDE that lets you build programs by snapping together blocks — no syntax required. Under the hood, it compiles your block programs all the way to WebAssembly and runs them at near-native speed, right inside your browser.

---

## What It Does

### Visual Block Programming
Write programs by dragging and connecting blocks in a Blockly-powered workspace. Blocks cover everything from arithmetic and control flow to arrays and ML operations — all without touching a line of text.

### Compiles to WebAssembly
Your block program goes through a three-stage pipeline:

```
Blockly blocks → Simulizer AST → WAT (WebAssembly Text) → WASM binary
```

The final binary runs in a Web Worker, keeping the UI responsive even during heavy computation.

### Machine Learning with TensorFlow.js
Tensor blocks let you create and manipulate multi-dimensional arrays using TF.js — matrix multiplication, scaling, Perlin noise generation, and more. The worker backend automatically picks the fastest available runtime: WebGPU → WebGL → CPU.

### Live Console Output
Results stream back to the main thread in real time. The console supports:
- **Text logs** — print values as your program runs
- **Progress bars** — track loop iterations or training steps
- **Matrix viewer** — visualize tensor data as an image

### Supported Types and Operations
| Category | Blocks |
|---|---|
| Integers (i32) | Arithmetic, bitwise ops, comparisons |
| Floats (f64) | Arithmetic, math functions |
| Booleans | Logical and, or, not |
| Variables | Declare and read local variables |
| Control flow | if / while / for |
| Arrays | Typed array literals, safe get/set/length |
| Tensors | Create, matmul, scale, Perlin noise |
| Debug | Log values, show matrices, progress bars |

### Internationalization
The UI supports English and Korean, with language packs fetched and cached in the browser.

---

## Requirements

- **Node.js** (v18 or higher)
- **npm** (v8 or higher)
- **Emscripten** — Required for building WebAssembly from C++
  
  Install via:
  ```bash
  git clone https://github.com/emscripten-core/emsdk.git
  cd emsdk
  ./emsdk install latest
  ./emsdk activate latest
  source ./emsdk_env.sh  # On macOS/Linux
  # OR on Windows:
  emsdk_env.bat
  ```

---

## Getting Started

```bash
npm install
npm run build:wasm
npm run dev      # Open http://localhost:3000
```

---

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0).

### Important Notice
Under AGPL-3.0, if you modify and run this software over a network (e.g., as a service), 
you must make the source code available to your users. This is different from regular GPL — 
network use triggers the disclosure requirement.

For more details, see the [LICENSE](LICENSE) file or visit [https://www.gnu.org/licenses/agpl-3.0.html](https://www.gnu.org/licenses/agpl-3.0.html)