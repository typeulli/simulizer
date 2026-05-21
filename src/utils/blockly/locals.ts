import { simulizer } from "../wasm/engine";
import { BlockBuilder, type BlockSet } from "./$base";

export type ConstCategory = "math" | "fundamental" | "experimental";

export interface BuiltinConst {
    name: string;
    value: number;
    label: string;
    category: ConstCategory;
}

export const BUILTIN_CONSTS: BuiltinConst[] = [
    // Math constants
    { name: "PI",          value: Math.PI,                label: "π",                 category: "math" },
    { name: "TAU",         value: 2 * Math.PI,            label: "2π",                category: "math" },
    { name: "E",           value: Math.E,                 label: "e (Euler)",         category: "math" },
    { name: "PHI",         value: (1 + Math.sqrt(5)) / 2, label: "φ (Golden ratio)",  category: "math" },
    { name: "SQRT2",       value: Math.SQRT2,             label: "√2",                category: "math" },
    { name: "SQRT3",       value: Math.sqrt(3),           label: "√3",                category: "math" },
    { name: "LN2",         value: Math.LN2,               label: "ln 2",              category: "math" },
    { name: "LN10",        value: Math.LN10,              label: "ln 10",             category: "math" },
    { name: "LOG2E",       value: Math.LOG2E,             label: "log₂ e",            category: "math" },
    { name: "LOG10E",      value: Math.LOG10E,            label: "log₁₀ e",           category: "math" },
    { name: "DEG_TO_RAD",  value: Math.PI / 180,          label: "π / 180",           category: "math" },
    { name: "RAD_TO_DEG",  value: 180 / Math.PI,          label: "180 / π",           category: "math" },

    // Fundamental physics constants (universal)
    { name: "PLANCK",      value: 6.62607015e-34,    label: "h (Planck, J·s)",                category: "fundamental" },
    { name: "HBAR",        value: 1.054571817e-34,   label: "ℏ (h/2π, J·s)",                  category: "fundamental" },
    { name: "C_LIGHT",     value: 299792458,         label: "c (speed of light, m/s)",        category: "fundamental" },
    { name: "G_GRAV",      value: 6.67430e-11,       label: "G (gravitational, m³/kg·s²)",   category: "fundamental" },
    { name: "BOLTZMANN",   value: 1.380649e-23,      label: "k_B (Boltzmann, J/K)",           category: "fundamental" },
    { name: "AVOGADRO",    value: 6.02214076e23,     label: "N_A (Avogadro, 1/mol)",          category: "fundamental" },
    { name: "GAS_R",       value: 8.314462618,       label: "R (gas constant, J/mol·K)",      category: "fundamental" },
    { name: "ELEM_CHARGE", value: 1.602176634e-19,   label: "e (elementary charge, C)",       category: "fundamental" },
    { name: "EPSILON_0",   value: 8.8541878128e-12,  label: "ε₀ (vacuum permittivity, F/m)",  category: "fundamental" },
    { name: "MU_0",        value: 1.25663706212e-6,  label: "μ₀ (vacuum permeability, N/A²)", category: "fundamental" },
    { name: "STEFAN_BOLTZ",value: 5.670374419e-8,    label: "σ (Stefan-Boltzmann, W/m²·K⁴)", category: "fundamental" },
    { name: "MASS_E",      value: 9.1093837015e-31,  label: "m_e (electron mass, kg)",        category: "fundamental" },
    { name: "MASS_P",      value: 1.67262192369e-27, label: "m_p (proton mass, kg)",          category: "fundamental" },
    { name: "MASS_N",      value: 1.67492749804e-27, label: "m_n (neutron mass, kg)",         category: "fundamental" },
    { name: "FINE_STRUCT", value: 7.2973525693e-3,   label: "α (fine-structure constant)",   category: "fundamental" },
    { name: "RYDBERG",     value: 1.0973731568160e7, label: "R∞ (Rydberg, 1/m)",              category: "fundamental" },

    // Experimental physics constants (condition/locale-specific)
    { name: "G_EARTH",     value: 9.80665,           label: "g (standard gravity, m/s²)",    category: "experimental" },
];

export const LOCAL_BLOCKS: BlockSet = {
    LOCAL_DECL_I32: new BlockBuilder("local_decl_i32", undefined, 330, "int 변수 선언")
        .addBody("int var %1 = %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("INIT", "i32")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const init = ctx.blockToExpr(block.getInputTargetBlock("INIT"), ctx);
            if (!init) return null;
            const local = ctx.declareLocal(ctx, name, simulizer.i32, block.id);
            return new simulizer.LocalSet(local, ctx.coerce(init, simulizer.i32));
        }),
    LOCAL_DECL_F64: new BlockBuilder("local_decl_f64", undefined, 330, "float 변수 선언")
        .addBody("float var %1 = %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("INIT", "f64")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const init = ctx.blockToExpr(block.getInputTargetBlock("INIT"), ctx);
            if (!init) return null;
            const local = ctx.declareLocal(ctx, name, simulizer.f64, block.id);
            return new simulizer.LocalSet(local, ctx.coerce(init, simulizer.f64));
        }),
    LOCAL_GET_I32: new BlockBuilder("local_get_i32", "i32", 330, "int 변수 읽기")
        .addBody("int %1")
        .addArg("field_input", "NAME", "x")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return ctx.getOrCreateLocal(ctx, name, simulizer.i32);
        }),
    LOCAL_GET_F64: new BlockBuilder("local_get_f64", "f64", 330, "float 변수 읽기")
        .addBody("float %1")
        .addArg("field_input", "NAME", "x")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return ctx.getOrCreateLocal(ctx, name, simulizer.f64);
        }),
    LOCAL_SET_I32: new BlockBuilder("local_set_i32", undefined, 330, "int 변수 대입")
        .addBody("int %1 ← %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("VALUE", "i32")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const val = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!val) return null;
            const local = ctx.getOrCreateLocal(ctx, name, simulizer.i32);
            return new simulizer.LocalSet(local, ctx.coerce(val, simulizer.i32));
        }),
    LOCAL_SET_F64: new BlockBuilder("local_set_f64", undefined, 330, "float 변수 대입")
        .addBody("float %1 ← %2")
        .addArg("field_input", "NAME", "x")
        .addArgValue("VALUE", "f64")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const val = ctx.blockToExpr(block.getInputTargetBlock("VALUE"), ctx);
            if (!val) return null;
            const local = ctx.getOrCreateLocal(ctx, name, simulizer.f64);
            return new simulizer.LocalSet(local, ctx.coerce(val, simulizer.f64));
        }),
}

export function xmlLocalBlocks(cat: string, constBtnLabel: string) {
    return `<category name="${cat}" colour="${330}">
    <sep gap="16"></sep>
    <label text="Builtin Constants"></label>
    <button text="${constBtnLabel}" callbackKey="OPEN_CONST_MGR"></button>
    <label text="Variable"></label>
    <block type="local_decl_i32"><value name="INIT"><block type="i32_const"></block></value></block>
    <block type="local_decl_f64"><value name="INIT"><block type="f64_const"></block></value></block>
    <block type="local_set_i32"><value name="VALUE"><block type="i32_const"></block></value></block>
    <block type="local_set_f64"><value name="VALUE"><block type="f64_const"></block></value></block>
    <block type="local_get_i32"></block>
    <block type="local_get_f64"></block>
</category>`;
}
