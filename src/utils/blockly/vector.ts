import { simulizer } from "../wasm/engine";
import { BlockBuilder, type BlockSet, type CompileCtx } from "./$base";

// ── vec2 타입 ──────────────────────────────────────────────────────────────────
// WAT 스택 규약: vec2 값은 두 개의 f64 (x, y) 순서로 쌓임
//   push: x 먼저, y 나중  /  pop: y 먼저, x 나중

export const vec2Type = new simulizer.Type("vec2");

// ── vec3 타입 ──────────────────────────────────────────────────────────────────
// WAT 스택 규약: vec3 값은 세 개의 f64 (x, y, z) 순서로 쌓임
//   push: x, y, z 순서  /  pop: z, y, x 순서

export const vec3Type = new simulizer.Type("vec3");

function xKey(n: string) { return `__vec2_${n}_x`; }
function yKey(n: string) { return `__vec2_${n}_y`; }
function x3Key(n: string) { return `__vec3_${n}_x`; }
function y3Key(n: string) { return `__vec3_${n}_y`; }
function z3Key(n: string) { return `__vec3_${n}_z`; }

let _uid = 0;
function uid() { return `v${_uid++}`; }

function allocTemps(ctx: CompileCtx, tag: string) {
    const id = `${tag}_${uid()}`;
    return {
        x: ctx.getOrCreateLocal(ctx, `__vt_${id}_x`, simulizer.f64),
        y: ctx.getOrCreateLocal(ctx, `__vt_${id}_y`, simulizer.f64),
    };
}

function allocTemps3(ctx: CompileCtx, tag: string) {
    const id = `${tag}_${uid()}`;
    return {
        x: ctx.getOrCreateLocal(ctx, `__vt_${id}_x`, simulizer.f64),
        y: ctx.getOrCreateLocal(ctx, `__vt_${id}_y`, simulizer.f64),
        z: ctx.getOrCreateLocal(ctx, `__vt_${id}_z`, simulizer.f64),
    };
}

// ── vec2 Expr 클래스 ───────────────────────────────────────────────────────────

class Vec2Pair extends simulizer.Expr {
    constructor(public x: simulizer.Expr, public y: simulizer.Expr) { super("vec2_pair"); }
    inferType() { return vec2Type; }
    compile() { return `${this.x.compile()}\n${this.y.compile()}`; }
}

export class Vec2Load extends simulizer.Expr {
    constructor(public lx: simulizer.Local, public ly: simulizer.Local) { super("vec2_load"); }
    inferType() { return vec2Type; }
    compile() { return `local.get $${this.lx.name}\nlocal.get $${this.ly.name}`; }
}

class Vec2Store extends simulizer.Expr {
    constructor(
        public lx: simulizer.Local,
        public ly: simulizer.Local,
        public val: simulizer.Expr,
    ) { super("vec2_store"); }
    inferType() { return simulizer.void_; }
    compile() {
        return [
            this.val.compile(),
            `local.set $${this.ly.name}`,
            `local.set $${this.lx.name}`,
        ].join("\n");
    }
}

class Vec2Component extends simulizer.Expr {
    constructor(
        public v: simulizer.Expr,
        public tv: { x: simulizer.Local; y: simulizer.Local },
        public axis: "x" | "y",
    ) { super("vec2_component"); }
    inferType() { return simulizer.f64; }
    compile() {
        const keep = this.axis === "x" ? this.tv.x : this.tv.y;
        return [
            this.v.compile(),
            `local.set $${this.tv.y.name}`,
            `local.set $${this.tv.x.name}`,
            `local.get $${keep.name}`,
        ].join("\n");
    }
}

class Vec2Len extends simulizer.Expr {
    constructor(
        public v: simulizer.Expr,
        public tv: { x: simulizer.Local; y: simulizer.Local },
        public sq: boolean,
    ) { super("vec2_len"); }
    inferType() { return simulizer.f64; }
    compile() {
        const lenSq = [
            `local.get $${this.tv.x.name}`, `local.get $${this.tv.x.name}`, `f64.mul`,
            `local.get $${this.tv.y.name}`, `local.get $${this.tv.y.name}`, `f64.mul`,
            `f64.add`,
        ].join("\n");
        return [
            this.v.compile(),
            `local.set $${this.tv.y.name}`,
            `local.set $${this.tv.x.name}`,
            ...(this.sq ? [lenSq] : [lenSq, `f64.sqrt`]),
        ].join("\n");
    }
}

class Vec2Dot extends simulizer.Expr {
    constructor(
        public a: simulizer.Expr, public b: simulizer.Expr,
        public ta: { x: simulizer.Local; y: simulizer.Local },
        public tb: { x: simulizer.Local; y: simulizer.Local },
    ) { super("vec2_dot"); }
    inferType() { return simulizer.f64; }
    compile() {
        return [
            this.a.compile(),
            `local.set $${this.ta.y.name}`, `local.set $${this.ta.x.name}`,
            this.b.compile(),
            `local.set $${this.tb.y.name}`, `local.set $${this.tb.x.name}`,
            `local.get $${this.ta.x.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.ta.y.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
            `f64.add`,
        ].join("\n");
    }
}

class Vec2BinOp extends simulizer.Expr {
    constructor(
        public a: simulizer.Expr, public b: simulizer.Expr,
        public ta: { x: simulizer.Local; y: simulizer.Local },
        public tb: { x: simulizer.Local; y: simulizer.Local },
        public op: "f64.add" | "f64.sub",
    ) { super("vec2_binop"); }
    inferType() { return vec2Type; }
    compile() {
        return [
            this.a.compile(),
            `local.set $${this.ta.y.name}`, `local.set $${this.ta.x.name}`,
            this.b.compile(),
            `local.set $${this.tb.y.name}`, `local.set $${this.tb.x.name}`,
            `local.get $${this.ta.x.name}`, `local.get $${this.tb.x.name}`, this.op,
            `local.get $${this.ta.y.name}`, `local.get $${this.tb.y.name}`, this.op,
        ].join("\n");
    }
}

class Vec2Scale extends simulizer.Expr {
    constructor(
        public v: simulizer.Expr,
        public s: simulizer.Expr,
        public tv: { x: simulizer.Local; y: simulizer.Local },
        public ts: simulizer.Local,
    ) { super("vec2_scale"); }
    inferType() { return vec2Type; }
    compile() {
        return [
            this.v.compile(),
            `local.set $${this.tv.y.name}`, `local.set $${this.tv.x.name}`,
            this.s.compile(), `local.set $${this.ts.name}`,
            `local.get $${this.ts.name}`, `local.get $${this.tv.x.name}`, `f64.mul`,
            `local.get $${this.ts.name}`, `local.get $${this.tv.y.name}`, `f64.mul`,
        ].join("\n");
    }
}

class Vec2Neg extends simulizer.Expr {
    constructor(
        public v: simulizer.Expr,
        public tv: { x: simulizer.Local; y: simulizer.Local },
    ) { super("vec2_neg"); }
    inferType() { return vec2Type; }
    compile() {
        return [
            this.v.compile(),
            `local.set $${this.tv.y.name}`, `local.set $${this.tv.x.name}`,
            `local.get $${this.tv.x.name}`, `f64.neg`,
            `local.get $${this.tv.y.name}`, `f64.neg`,
        ].join("\n");
    }
}

class Vec2Normalize extends simulizer.Expr {
    constructor(
        public v: simulizer.Expr,
        public tv: { x: simulizer.Local; y: simulizer.Local },
        public tlen: simulizer.Local,
    ) { super("vec2_normalize"); }
    inferType() { return vec2Type; }
    compile() {
        return [
            this.v.compile(),
            `local.set $${this.tv.y.name}`, `local.set $${this.tv.x.name}`,
            `local.get $${this.tv.x.name}`, `local.get $${this.tv.x.name}`, `f64.mul`,
            `local.get $${this.tv.y.name}`, `local.get $${this.tv.y.name}`, `f64.mul`,
            `f64.add`, `f64.sqrt`, `local.set $${this.tlen.name}`,
            `local.get $${this.tv.x.name}`, `local.get $${this.tlen.name}`, `f64.div`,
            `local.get $${this.tv.y.name}`, `local.get $${this.tlen.name}`, `f64.div`,
        ].join("\n");
    }
}

class Vec2ProjScalar extends simulizer.Expr {
    constructor(
        public a: simulizer.Expr, public b: simulizer.Expr,
        public ta: { x: simulizer.Local; y: simulizer.Local },
        public tb: { x: simulizer.Local; y: simulizer.Local },
    ) { super("vec2_proj_scalar"); }
    inferType() { return simulizer.f64; }
    compile() {
        return [
            this.a.compile(),
            `local.set $${this.ta.y.name}`, `local.set $${this.ta.x.name}`,
            this.b.compile(),
            `local.set $${this.tb.y.name}`, `local.set $${this.tb.x.name}`,
            `local.get $${this.ta.x.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.ta.y.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
            `f64.add`,
            `local.get $${this.tb.x.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.tb.y.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
            `f64.add`, `f64.sqrt`, `f64.div`,
        ].join("\n");
    }
}

class Vec2ProjVec extends simulizer.Expr {
    constructor(
        public a: simulizer.Expr, public b: simulizer.Expr,
        public ta: { x: simulizer.Local; y: simulizer.Local },
        public tb: { x: simulizer.Local; y: simulizer.Local },
        public ts: simulizer.Local,
    ) { super("vec2_proj_vec"); }
    inferType() { return vec2Type; }
    compile() {
        return [
            this.a.compile(),
            `local.set $${this.ta.y.name}`, `local.set $${this.ta.x.name}`,
            this.b.compile(),
            `local.set $${this.tb.y.name}`, `local.set $${this.tb.x.name}`,
            `local.get $${this.ta.x.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.ta.y.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
            `f64.add`,
            `local.get $${this.tb.x.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.tb.y.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
            `f64.add`, `f64.div`, `local.set $${this.ts.name}`,
            `local.get $${this.ts.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.ts.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
        ].join("\n");
    }
}

// ── vec3 Expr 클래스 ───────────────────────────────────────────────────────────

class Vec3Pair extends simulizer.Expr {
    constructor(public x: simulizer.Expr, public y: simulizer.Expr, public z: simulizer.Expr) { super("vec3_pair"); }
    inferType() { return vec3Type; }
    compile() { return `${this.x.compile()}\n${this.y.compile()}\n${this.z.compile()}`; }
}

export class Vec3Load extends simulizer.Expr {
    constructor(
        public lx: simulizer.Local,
        public ly: simulizer.Local,
        public lz: simulizer.Local,
    ) { super("vec3_load"); }
    inferType() { return vec3Type; }
    compile() {
        return `local.get $${this.lx.name}\nlocal.get $${this.ly.name}\nlocal.get $${this.lz.name}`;
    }
}

class Vec3Store extends simulizer.Expr {
    constructor(
        public lx: simulizer.Local,
        public ly: simulizer.Local,
        public lz: simulizer.Local,
        public val: simulizer.Expr,
    ) { super("vec3_store"); }
    inferType() { return simulizer.void_; }
    compile() {
        return [
            this.val.compile(),
            `local.set $${this.lz.name}`,
            `local.set $${this.ly.name}`,
            `local.set $${this.lx.name}`,
        ].join("\n");
    }
}

class Vec3Component extends simulizer.Expr {
    constructor(
        public v: simulizer.Expr,
        public tv: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
        public axis: "x" | "y" | "z",
    ) { super("vec3_component"); }
    inferType() { return simulizer.f64; }
    compile() {
        const keep = this.axis === "x" ? this.tv.x : this.axis === "y" ? this.tv.y : this.tv.z;
        return [
            this.v.compile(),
            `local.set $${this.tv.z.name}`,
            `local.set $${this.tv.y.name}`,
            `local.set $${this.tv.x.name}`,
            `local.get $${keep.name}`,
        ].join("\n");
    }
}

class Vec3Len extends simulizer.Expr {
    constructor(
        public v: simulizer.Expr,
        public tv: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
        public sq: boolean,
    ) { super("vec3_len"); }
    inferType() { return simulizer.f64; }
    compile() {
        const lenSq = [
            `local.get $${this.tv.x.name}`, `local.get $${this.tv.x.name}`, `f64.mul`,
            `local.get $${this.tv.y.name}`, `local.get $${this.tv.y.name}`, `f64.mul`,
            `f64.add`,
            `local.get $${this.tv.z.name}`, `local.get $${this.tv.z.name}`, `f64.mul`,
            `f64.add`,
        ].join("\n");
        return [
            this.v.compile(),
            `local.set $${this.tv.z.name}`,
            `local.set $${this.tv.y.name}`,
            `local.set $${this.tv.x.name}`,
            ...(this.sq ? [lenSq] : [lenSq, `f64.sqrt`]),
        ].join("\n");
    }
}

class Vec3Dot extends simulizer.Expr {
    constructor(
        public a: simulizer.Expr, public b: simulizer.Expr,
        public ta: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
        public tb: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
    ) { super("vec3_dot"); }
    inferType() { return simulizer.f64; }
    compile() {
        return [
            this.a.compile(),
            `local.set $${this.ta.z.name}`, `local.set $${this.ta.y.name}`, `local.set $${this.ta.x.name}`,
            this.b.compile(),
            `local.set $${this.tb.z.name}`, `local.set $${this.tb.y.name}`, `local.set $${this.tb.x.name}`,
            `local.get $${this.ta.x.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.ta.y.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
            `f64.add`,
            `local.get $${this.ta.z.name}`, `local.get $${this.tb.z.name}`, `f64.mul`,
            `f64.add`,
        ].join("\n");
    }
}

class Vec3Cross extends simulizer.Expr {
    constructor(
        public a: simulizer.Expr, public b: simulizer.Expr,
        public ta: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
        public tb: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
    ) { super("vec3_cross"); }
    inferType() { return vec3Type; }
    compile() {
        const { ta, tb } = this;
        return [
            this.a.compile(),
            `local.set $${ta.z.name}`, `local.set $${ta.y.name}`, `local.set $${ta.x.name}`,
            this.b.compile(),
            `local.set $${tb.z.name}`, `local.set $${tb.y.name}`, `local.set $${tb.x.name}`,
            // rx = ay*bz - az*by
            `local.get $${ta.y.name}`, `local.get $${tb.z.name}`, `f64.mul`,
            `local.get $${ta.z.name}`, `local.get $${tb.y.name}`, `f64.mul`,
            `f64.sub`,
            // ry = az*bx - ax*bz
            `local.get $${ta.z.name}`, `local.get $${tb.x.name}`, `f64.mul`,
            `local.get $${ta.x.name}`, `local.get $${tb.z.name}`, `f64.mul`,
            `f64.sub`,
            // rz = ax*by - ay*bx
            `local.get $${ta.x.name}`, `local.get $${tb.y.name}`, `f64.mul`,
            `local.get $${ta.y.name}`, `local.get $${tb.x.name}`, `f64.mul`,
            `f64.sub`,
        ].join("\n");
    }
}

class Vec3BinOp extends simulizer.Expr {
    constructor(
        public a: simulizer.Expr, public b: simulizer.Expr,
        public ta: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
        public tb: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
        public op: "f64.add" | "f64.sub",
    ) { super("vec3_binop"); }
    inferType() { return vec3Type; }
    compile() {
        return [
            this.a.compile(),
            `local.set $${this.ta.z.name}`, `local.set $${this.ta.y.name}`, `local.set $${this.ta.x.name}`,
            this.b.compile(),
            `local.set $${this.tb.z.name}`, `local.set $${this.tb.y.name}`, `local.set $${this.tb.x.name}`,
            `local.get $${this.ta.x.name}`, `local.get $${this.tb.x.name}`, this.op,
            `local.get $${this.ta.y.name}`, `local.get $${this.tb.y.name}`, this.op,
            `local.get $${this.ta.z.name}`, `local.get $${this.tb.z.name}`, this.op,
        ].join("\n");
    }
}

class Vec3Scale extends simulizer.Expr {
    constructor(
        public v: simulizer.Expr,
        public s: simulizer.Expr,
        public tv: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
        public ts: simulizer.Local,
    ) { super("vec3_scale"); }
    inferType() { return vec3Type; }
    compile() {
        return [
            this.v.compile(),
            `local.set $${this.tv.z.name}`, `local.set $${this.tv.y.name}`, `local.set $${this.tv.x.name}`,
            this.s.compile(), `local.set $${this.ts.name}`,
            `local.get $${this.ts.name}`, `local.get $${this.tv.x.name}`, `f64.mul`,
            `local.get $${this.ts.name}`, `local.get $${this.tv.y.name}`, `f64.mul`,
            `local.get $${this.ts.name}`, `local.get $${this.tv.z.name}`, `f64.mul`,
        ].join("\n");
    }
}

class Vec3Neg extends simulizer.Expr {
    constructor(
        public v: simulizer.Expr,
        public tv: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
    ) { super("vec3_neg"); }
    inferType() { return vec3Type; }
    compile() {
        return [
            this.v.compile(),
            `local.set $${this.tv.z.name}`, `local.set $${this.tv.y.name}`, `local.set $${this.tv.x.name}`,
            `local.get $${this.tv.x.name}`, `f64.neg`,
            `local.get $${this.tv.y.name}`, `f64.neg`,
            `local.get $${this.tv.z.name}`, `f64.neg`,
        ].join("\n");
    }
}

class Vec3Normalize extends simulizer.Expr {
    constructor(
        public v: simulizer.Expr,
        public tv: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
        public tlen: simulizer.Local,
    ) { super("vec3_normalize"); }
    inferType() { return vec3Type; }
    compile() {
        return [
            this.v.compile(),
            `local.set $${this.tv.z.name}`, `local.set $${this.tv.y.name}`, `local.set $${this.tv.x.name}`,
            `local.get $${this.tv.x.name}`, `local.get $${this.tv.x.name}`, `f64.mul`,
            `local.get $${this.tv.y.name}`, `local.get $${this.tv.y.name}`, `f64.mul`,
            `f64.add`,
            `local.get $${this.tv.z.name}`, `local.get $${this.tv.z.name}`, `f64.mul`,
            `f64.add`, `f64.sqrt`, `local.set $${this.tlen.name}`,
            `local.get $${this.tv.x.name}`, `local.get $${this.tlen.name}`, `f64.div`,
            `local.get $${this.tv.y.name}`, `local.get $${this.tlen.name}`, `f64.div`,
            `local.get $${this.tv.z.name}`, `local.get $${this.tlen.name}`, `f64.div`,
        ].join("\n");
    }
}

class Vec3ProjScalar extends simulizer.Expr {
    constructor(
        public a: simulizer.Expr, public b: simulizer.Expr,
        public ta: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
        public tb: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
    ) { super("vec3_proj_scalar"); }
    inferType() { return simulizer.f64; }
    compile() {
        return [
            this.a.compile(),
            `local.set $${this.ta.z.name}`, `local.set $${this.ta.y.name}`, `local.set $${this.ta.x.name}`,
            this.b.compile(),
            `local.set $${this.tb.z.name}`, `local.set $${this.tb.y.name}`, `local.set $${this.tb.x.name}`,
            // dot(a,b)
            `local.get $${this.ta.x.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.ta.y.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
            `f64.add`,
            `local.get $${this.ta.z.name}`, `local.get $${this.tb.z.name}`, `f64.mul`,
            `f64.add`,
            // |b|
            `local.get $${this.tb.x.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.tb.y.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
            `f64.add`,
            `local.get $${this.tb.z.name}`, `local.get $${this.tb.z.name}`, `f64.mul`,
            `f64.add`, `f64.sqrt`, `f64.div`,
        ].join("\n");
    }
}

class Vec3ProjVec extends simulizer.Expr {
    constructor(
        public a: simulizer.Expr, public b: simulizer.Expr,
        public ta: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
        public tb: { x: simulizer.Local; y: simulizer.Local; z: simulizer.Local },
        public ts: simulizer.Local,
    ) { super("vec3_proj_vec"); }
    inferType() { return vec3Type; }
    compile() {
        return [
            this.a.compile(),
            `local.set $${this.ta.z.name}`, `local.set $${this.ta.y.name}`, `local.set $${this.ta.x.name}`,
            this.b.compile(),
            `local.set $${this.tb.z.name}`, `local.set $${this.tb.y.name}`, `local.set $${this.tb.x.name}`,
            // dot(a,b)
            `local.get $${this.ta.x.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.ta.y.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
            `f64.add`,
            `local.get $${this.ta.z.name}`, `local.get $${this.tb.z.name}`, `f64.mul`,
            `f64.add`,
            // |b|²
            `local.get $${this.tb.x.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.tb.y.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
            `f64.add`,
            `local.get $${this.tb.z.name}`, `local.get $${this.tb.z.name}`, `f64.mul`,
            `f64.add`,
            `f64.div`, `local.set $${this.ts.name}`,
            `local.get $${this.ts.name}`, `local.get $${this.tb.x.name}`, `f64.mul`,
            `local.get $${this.ts.name}`, `local.get $${this.tb.y.name}`, `f64.mul`,
            `local.get $${this.ts.name}`, `local.get $${this.tb.z.name}`, `f64.mul`,
        ].join("\n");
    }
}

// ── 블록 정의 ──────────────────────────────────────────────────────────────────

const C2 = 200;
const C3 = 160;

export const VECTOR_BLOCKS: BlockSet = {

    // ── vec2 리터럴 / 변수 ─────────────────────────────────────────────────────

    VEC2_LITERAL: new BlockBuilder("vec2_literal", "vec2", C2, "f64 두 값으로 vec2 생성")
        .addBody("vec2( %1 , %2 )")
        .addArgValue("X", "f64")
        .addArgValue("Y", "f64")
        .expr((block, ctx) => {
            const x = ctx.blockToExpr(block.getInputTargetBlock("X"), ctx);
            const y = ctx.blockToExpr(block.getInputTargetBlock("Y"), ctx);
            if (!x || !y) return null;
            return new Vec2Pair(ctx.coerce(x, simulizer.f64), ctx.coerce(y, simulizer.f64));
        }),

    VEC2_GET: new BlockBuilder("vec2_get", "vec2", C2, "vec2 변수 읽기")
        .addBody("vec2 %1")
        .addArg("field_input", "NAME", "v")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return new Vec2Load(
                ctx.getOrCreateLocal(ctx, xKey(name), simulizer.f64),
                ctx.getOrCreateLocal(ctx, yKey(name), simulizer.f64),
            );
        }),

    VEC2_DECL: new BlockBuilder("vec2_decl", undefined, C2, "vec2 변수 선언 및 초기화")
        .addBody("vec2 var %1 = %2")
        .addArg("field_input", "NAME", "v")
        .addArgValue("VEC", "vec2")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec2Store(
                ctx.getOrCreateLocal(ctx, xKey(name), simulizer.f64),
                ctx.getOrCreateLocal(ctx, yKey(name), simulizer.f64),
                vec,
            );
        }),

    VEC2_SET: new BlockBuilder("vec2_set", undefined, C2, "vec2 변수 대입")
        .addBody("vec2 %1 ← %2")
        .addArg("field_input", "NAME", "v")
        .addArgValue("VEC", "vec2")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec2Store(
                ctx.getOrCreateLocal(ctx, xKey(name), simulizer.f64),
                ctx.getOrCreateLocal(ctx, yKey(name), simulizer.f64),
                vec,
            );
        }),

    // ── vec2 성분 / 크기 ───────────────────────────────────────────────────────

    VEC2_X: new BlockBuilder("vec2_x", "f64", C2, "vec2의 x 성분")
        .addBody("%1 .x")
        .addArgValue("VEC", "vec2")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec2Component(vec, allocTemps(ctx, "cx"), "x");
        }),

    VEC2_Y: new BlockBuilder("vec2_y", "f64", C2, "vec2의 y 성분")
        .addBody("%1 .y")
        .addArgValue("VEC", "vec2")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec2Component(vec, allocTemps(ctx, "cy"), "y");
        }),

    VEC2_LEN: new BlockBuilder("vec2_len", "f64", C2, "vec2 크기 |v|")
        .addBody("|%1|")
        .addArgValue("VEC", "vec2")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec2Len(vec, allocTemps(ctx, "len"), false);
        }),

    VEC2_LEN_SQ: new BlockBuilder("vec2_len_sq", "f64", C2, "vec2 크기 제곱 |v|²")
        .addBody("|%1|²")
        .addArgValue("VEC", "vec2")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec2Len(vec, allocTemps(ctx, "lensq"), true);
        }),

    // ── vec2 산술 연산 ─────────────────────────────────────────────────────────

    VEC2_ADD: new BlockBuilder("vec2_add", "vec2", C2, "vec2 덧셈")
        .addBody("%1 + %2")
        .addArgValue("A", "vec2")
        .addArgValue("B", "vec2")
        .expr((block, ctx) => {
            const a = ctx.blockToExpr(block.getInputTargetBlock("A"), ctx);
            const b = ctx.blockToExpr(block.getInputTargetBlock("B"), ctx);
            if (!a || !b) return null;
            return new Vec2BinOp(a, b, allocTemps(ctx, "aa"), allocTemps(ctx, "ab"), "f64.add");
        }),

    VEC2_SUB: new BlockBuilder("vec2_sub", "vec2", C2, "vec2 뺄셈")
        .addBody("%1 - %2")
        .addArgValue("A", "vec2")
        .addArgValue("B", "vec2")
        .expr((block, ctx) => {
            const a = ctx.blockToExpr(block.getInputTargetBlock("A"), ctx);
            const b = ctx.blockToExpr(block.getInputTargetBlock("B"), ctx);
            if (!a || !b) return null;
            return new Vec2BinOp(a, b, allocTemps(ctx, "sa"), allocTemps(ctx, "sb"), "f64.sub");
        }),

    VEC2_SCALE: new BlockBuilder("vec2_scale", "vec2", C2, "vec2 스칼라 곱")
        .addBody("%1 × %2")
        .addArgValue("VEC", "vec2")
        .addArgValue("S", "f64")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            const s   = ctx.blockToExpr(block.getInputTargetBlock("S"), ctx);
            if (!vec || !s) return null;
            const ts = ctx.getOrCreateLocal(ctx, `__vt_sc2_${uid()}`, simulizer.f64);
            return new Vec2Scale(vec, ctx.coerce(s, simulizer.f64), allocTemps(ctx, "sc"), ts);
        }),

    VEC2_NEG: new BlockBuilder("vec2_neg", "vec2", C2, "vec2 부호 반전")
        .addBody("-%1")
        .addArgValue("VEC", "vec2")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec2Neg(vec, allocTemps(ctx, "ng"));
        }),

    VEC2_NORMALIZE: new BlockBuilder("vec2_normalize", "vec2", C2, "vec2 정규화 v/|v|")
        .addBody("normalize(%1)")
        .addArgValue("VEC", "vec2")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            const tlen = ctx.getOrCreateLocal(ctx, `__vt_nl2_${uid()}`, simulizer.f64);
            return new Vec2Normalize(vec, allocTemps(ctx, "nv"), tlen);
        }),

    // ── vec2 내적 / 사영 ───────────────────────────────────────────────────────

    VEC2_DOT: new BlockBuilder("vec2_dot", "f64", C2, "두 vec2의 내적")
        .addBody("dot( %1 , %2 )")
        .addArgValue("A", "vec2")
        .addArgValue("B", "vec2")
        .expr((block, ctx) => {
            const a = ctx.blockToExpr(block.getInputTargetBlock("A"), ctx);
            const b = ctx.blockToExpr(block.getInputTargetBlock("B"), ctx);
            if (!a || !b) return null;
            return new Vec2Dot(a, b, allocTemps(ctx, "da"), allocTemps(ctx, "db"));
        }),

    VEC2_PROJ_SCALAR: new BlockBuilder("vec2_proj_scalar", "f64", C2, "스칼라 사영 dot(a,b)/|b|")
        .addBody("proj( %1 → %2 )")
        .addArgValue("A", "vec2")
        .addArgValue("B", "vec2")
        .expr((block, ctx) => {
            const a = ctx.blockToExpr(block.getInputTargetBlock("A"), ctx);
            const b = ctx.blockToExpr(block.getInputTargetBlock("B"), ctx);
            if (!a || !b) return null;
            return new Vec2ProjScalar(a, b, allocTemps(ctx, "psa"), allocTemps(ctx, "psb"));
        }),

    VEC2_PROJ_VEC: new BlockBuilder("vec2_proj_vec", "vec2", C2, "벡터 사영 (dot(a,b)/|b|²)·b")
        .addBody("proj_vec( %1 → %2 )")
        .addArgValue("A", "vec2")
        .addArgValue("B", "vec2")
        .expr((block, ctx) => {
            const a = ctx.blockToExpr(block.getInputTargetBlock("A"), ctx);
            const b = ctx.blockToExpr(block.getInputTargetBlock("B"), ctx);
            if (!a || !b) return null;
            const ts = ctx.getOrCreateLocal(ctx, `__vt_pvs_${uid()}`, simulizer.f64);
            return new Vec2ProjVec(a, b, allocTemps(ctx, "pva"), allocTemps(ctx, "pvb"), ts);
        }),

    // ── vec3 리터럴 / 변수 ─────────────────────────────────────────────────────

    VEC3_LITERAL: new BlockBuilder("vec3_literal", "vec3", C3, "f64 세 값으로 vec3 생성")
        .addBody("vec3( %1 , %2 , %3 )")
        .addArgValue("X", "f64")
        .addArgValue("Y", "f64")
        .addArgValue("Z", "f64")
        .expr((block, ctx) => {
            const x = ctx.blockToExpr(block.getInputTargetBlock("X"), ctx);
            const y = ctx.blockToExpr(block.getInputTargetBlock("Y"), ctx);
            const z = ctx.blockToExpr(block.getInputTargetBlock("Z"), ctx);
            if (!x || !y || !z) return null;
            return new Vec3Pair(
                ctx.coerce(x, simulizer.f64),
                ctx.coerce(y, simulizer.f64),
                ctx.coerce(z, simulizer.f64),
            );
        }),

    VEC3_GET: new BlockBuilder("vec3_get", "vec3", C3, "vec3 변수 읽기")
        .addBody("vec3 %1")
        .addArg("field_input", "NAME", "v")
        .expr((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            return new Vec3Load(
                ctx.getOrCreateLocal(ctx, x3Key(name), simulizer.f64),
                ctx.getOrCreateLocal(ctx, y3Key(name), simulizer.f64),
                ctx.getOrCreateLocal(ctx, z3Key(name), simulizer.f64),
            );
        }),

    VEC3_DECL: new BlockBuilder("vec3_decl", undefined, C3, "vec3 변수 선언 및 초기화")
        .addBody("vec3 var %1 = %2")
        .addArg("field_input", "NAME", "v")
        .addArgValue("VEC", "vec3")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec3Store(
                ctx.getOrCreateLocal(ctx, x3Key(name), simulizer.f64),
                ctx.getOrCreateLocal(ctx, y3Key(name), simulizer.f64),
                ctx.getOrCreateLocal(ctx, z3Key(name), simulizer.f64),
                vec,
            );
        }),

    VEC3_SET: new BlockBuilder("vec3_set", undefined, C3, "vec3 변수 대입")
        .addBody("vec3 %1 ← %2")
        .addArg("field_input", "NAME", "v")
        .addArgValue("VEC", "vec3")
        .stmt((block, ctx) => {
            const name = block.getFieldValue("NAME") as string;
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec3Store(
                ctx.getOrCreateLocal(ctx, x3Key(name), simulizer.f64),
                ctx.getOrCreateLocal(ctx, y3Key(name), simulizer.f64),
                ctx.getOrCreateLocal(ctx, z3Key(name), simulizer.f64),
                vec,
            );
        }),

    // ── vec3 성분 / 크기 ───────────────────────────────────────────────────────

    VEC3_X: new BlockBuilder("vec3_x", "f64", C3, "vec3의 x 성분")
        .addBody("%1 .x")
        .addArgValue("VEC", "vec3")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec3Component(vec, allocTemps3(ctx, "cx"), "x");
        }),

    VEC3_Y: new BlockBuilder("vec3_y", "f64", C3, "vec3의 y 성분")
        .addBody("%1 .y")
        .addArgValue("VEC", "vec3")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec3Component(vec, allocTemps3(ctx, "cy"), "y");
        }),

    VEC3_Z: new BlockBuilder("vec3_z", "f64", C3, "vec3의 z 성분")
        .addBody("%1 .z")
        .addArgValue("VEC", "vec3")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec3Component(vec, allocTemps3(ctx, "cz"), "z");
        }),

    VEC3_LEN: new BlockBuilder("vec3_len", "f64", C3, "vec3 크기 |v|")
        .addBody("|%1|")
        .addArgValue("VEC", "vec3")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec3Len(vec, allocTemps3(ctx, "len"), false);
        }),

    VEC3_LEN_SQ: new BlockBuilder("vec3_len_sq", "f64", C3, "vec3 크기 제곱 |v|²")
        .addBody("|%1|²")
        .addArgValue("VEC", "vec3")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec3Len(vec, allocTemps3(ctx, "lensq"), true);
        }),

    // ── vec3 산술 연산 ─────────────────────────────────────────────────────────

    VEC3_ADD: new BlockBuilder("vec3_add", "vec3", C3, "vec3 덧셈")
        .addBody("%1 + %2")
        .addArgValue("A", "vec3")
        .addArgValue("B", "vec3")
        .expr((block, ctx) => {
            const a = ctx.blockToExpr(block.getInputTargetBlock("A"), ctx);
            const b = ctx.blockToExpr(block.getInputTargetBlock("B"), ctx);
            if (!a || !b) return null;
            return new Vec3BinOp(a, b, allocTemps3(ctx, "aa"), allocTemps3(ctx, "ab"), "f64.add");
        }),

    VEC3_SUB: new BlockBuilder("vec3_sub", "vec3", C3, "vec3 뺄셈")
        .addBody("%1 - %2")
        .addArgValue("A", "vec3")
        .addArgValue("B", "vec3")
        .expr((block, ctx) => {
            const a = ctx.blockToExpr(block.getInputTargetBlock("A"), ctx);
            const b = ctx.blockToExpr(block.getInputTargetBlock("B"), ctx);
            if (!a || !b) return null;
            return new Vec3BinOp(a, b, allocTemps3(ctx, "sa"), allocTemps3(ctx, "sb"), "f64.sub");
        }),

    VEC3_SCALE: new BlockBuilder("vec3_scale", "vec3", C3, "vec3 스칼라 곱")
        .addBody("%1 × %2")
        .addArgValue("VEC", "vec3")
        .addArgValue("S", "f64")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            const s   = ctx.blockToExpr(block.getInputTargetBlock("S"), ctx);
            if (!vec || !s) return null;
            const ts = ctx.getOrCreateLocal(ctx, `__vt_sc3_${uid()}`, simulizer.f64);
            return new Vec3Scale(vec, ctx.coerce(s, simulizer.f64), allocTemps3(ctx, "sc"), ts);
        }),

    VEC3_NEG: new BlockBuilder("vec3_neg", "vec3", C3, "vec3 부호 반전")
        .addBody("-%1")
        .addArgValue("VEC", "vec3")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            return new Vec3Neg(vec, allocTemps3(ctx, "ng"));
        }),

    VEC3_NORMALIZE: new BlockBuilder("vec3_normalize", "vec3", C3, "vec3 정규화 v/|v|")
        .addBody("normalize(%1)")
        .addArgValue("VEC", "vec3")
        .expr((block, ctx) => {
            const vec = ctx.blockToExpr(block.getInputTargetBlock("VEC"), ctx);
            if (!vec) return null;
            const tlen = ctx.getOrCreateLocal(ctx, `__vt_nl3_${uid()}`, simulizer.f64);
            return new Vec3Normalize(vec, allocTemps3(ctx, "nv"), tlen);
        }),

    // ── vec3 내적 / 외적 / 사영 ────────────────────────────────────────────────

    VEC3_DOT: new BlockBuilder("vec3_dot", "f64", C3, "두 vec3의 내적")
        .addBody("dot( %1 , %2 )")
        .addArgValue("A", "vec3")
        .addArgValue("B", "vec3")
        .expr((block, ctx) => {
            const a = ctx.blockToExpr(block.getInputTargetBlock("A"), ctx);
            const b = ctx.blockToExpr(block.getInputTargetBlock("B"), ctx);
            if (!a || !b) return null;
            return new Vec3Dot(a, b, allocTemps3(ctx, "da"), allocTemps3(ctx, "db"));
        }),

    VEC3_CROSS: new BlockBuilder("vec3_cross", "vec3", C3, "두 vec3의 외적 a × b")
        .addBody("%1 × %2")
        .addArgValue("A", "vec3")
        .addArgValue("B", "vec3")
        .expr((block, ctx) => {
            const a = ctx.blockToExpr(block.getInputTargetBlock("A"), ctx);
            const b = ctx.blockToExpr(block.getInputTargetBlock("B"), ctx);
            if (!a || !b) return null;
            return new Vec3Cross(a, b, allocTemps3(ctx, "ca"), allocTemps3(ctx, "cb"));
        }),

    VEC3_PROJ_SCALAR: new BlockBuilder("vec3_proj_scalar", "f64", C3, "스칼라 사영 dot(a,b)/|b|")
        .addBody("proj( %1 → %2 )")
        .addArgValue("A", "vec3")
        .addArgValue("B", "vec3")
        .expr((block, ctx) => {
            const a = ctx.blockToExpr(block.getInputTargetBlock("A"), ctx);
            const b = ctx.blockToExpr(block.getInputTargetBlock("B"), ctx);
            if (!a || !b) return null;
            return new Vec3ProjScalar(a, b, allocTemps3(ctx, "psa"), allocTemps3(ctx, "psb"));
        }),

    VEC3_PROJ_VEC: new BlockBuilder("vec3_proj_vec", "vec3", C3, "벡터 사영 (dot(a,b)/|b|²)·b")
        .addBody("proj_vec( %1 → %2 )")
        .addArgValue("A", "vec3")
        .addArgValue("B", "vec3")
        .expr((block, ctx) => {
            const a = ctx.blockToExpr(block.getInputTargetBlock("A"), ctx);
            const b = ctx.blockToExpr(block.getInputTargetBlock("B"), ctx);
            if (!a || !b) return null;
            const ts = ctx.getOrCreateLocal(ctx, `__vt_pv3_${uid()}`, simulizer.f64);
            return new Vec3ProjVec(a, b, allocTemps3(ctx, "pva"), allocTemps3(ctx, "pvb"), ts);
        }),
}

export function xmlVectorBlocks(cat: string) {
    return `<category name="${cat}" colour="${200}">
    <category name="2D vec2" colour="${200}">
        <sep gap="16"></sep>
    <label text="2D Vector"></label>
        <block type="vec2_literal">
            <value name="X"><block type="f64_const"></block></value>
            <value name="Y"><block type="f64_const"></block></value>
        </block>
        <block type="vec2_get"></block>
        <block type="vec2_decl">
            <value name="VEC"><block type="vec2_literal">
                <value name="X"><block type="f64_const"></block></value>
                <value name="Y"><block type="f64_const"></block></value>
            </block></value>
        </block>
        <block type="vec2_set">
            <value name="VEC"><block type="vec2_literal">
                <value name="X"><block type="f64_const"></block></value>
                <value name="Y"><block type="f64_const"></block></value>
            </block></value>
        </block>
        <block type="vec2_x"></block>
        <block type="vec2_y"></block>
        <block type="vec2_len"></block>
        <block type="vec2_len_sq"></block>
        <block type="vec2_add"></block>
        <block type="vec2_sub"></block>
        <block type="vec2_scale"></block>
        <block type="vec2_neg"></block>
        <block type="vec2_normalize"></block>
        <block type="vec2_dot"></block>
        <block type="vec2_proj_scalar"></block>
        <block type="vec2_proj_vec"></block>
    </category>
    <category name="3D vec3" colour="${160}">
    <sep gap="16"></sep>
    <label text="3D Vector"></label>
        <block type="vec3_literal">
            <value name="X"><block type="f64_const"></block></value>
            <value name="Y"><block type="f64_const"></block></value>
            <value name="Z"><block type="f64_const"></block></value>
        </block>
        <block type="vec3_get"></block>
        <block type="vec3_decl">
            <value name="VEC"><block type="vec3_literal">
                <value name="X"><block type="f64_const"></block></value>
                <value name="Y"><block type="f64_const"></block></value>
                <value name="Z"><block type="f64_const"></block></value>
            </block></value>
        </block>
        <block type="vec3_set">
            <value name="VEC"><block type="vec3_literal">
                <value name="X"><block type="f64_const"></block></value>
                <value name="Y"><block type="f64_const"></block></value>
                <value name="Z"><block type="f64_const"></block></value>
            </block></value>
        </block>
        <block type="vec3_x"></block>
        <block type="vec3_y"></block>
        <block type="vec3_z"></block>
        <block type="vec3_len"></block>
        <block type="vec3_len_sq"></block>
        <block type="vec3_add"></block>
        <block type="vec3_sub"></block>
        <block type="vec3_scale"></block>
        <block type="vec3_neg"></block>
        <block type="vec3_normalize"></block>
        <block type="vec3_dot"></block>
        <block type="vec3_cross"></block>
        <block type="vec3_proj_scalar"></block>
        <block type="vec3_proj_vec"></block>
    </category>
</category>`;
}
