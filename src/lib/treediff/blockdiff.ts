import { CUSTOM_BLOCKS } from "@/simphy/lang/$blocks";
import BiMap from "@/utils/bimap";
import Queue from "@/utils/queue";
import { TreeNode, TreeDiffNode } from "./treediff";

const stmtSet = new Set(
    Object.values(CUSTOM_BLOCKS)
          .filter(block => block.buildMode == "stmt")
          .map(block => block.type)
);
export class NormalizeContext {
    data2key: BiMap<string, number>;
    type2inputs: Map<string, string[]>;
    idref: number;

    constructor() {
        this.data2key = new BiMap();
        this.type2inputs = new Map();
        this.idref = 0;
    }

    serialize(data: any): number {
        const str = JSON.stringify(data);
        if (!this.data2key.hasKey(str)) {
            const key = this.idref++;
            this.data2key.set(str, key);
        }
        return this.data2key.getByKey(str)!;
    }  
}

function serialize_inputs(data: any): any {
    const o: Record<string, any> = { key: data.type };
    if (data.fields) o.fields = structuredClone(data.fields);
    const childInputs: Record<string, any> = {};
    for (const k in (data.inputs ?? {})) {
        childInputs[k] = serialize_inputs(data.inputs[k].block);
    }
    if (Object.keys(childInputs).length > 0) o.inputs = childInputs;
    return o;
}


export function normalize(block: any, ctx: NormalizeContext) {
    const type2inputs = ctx.type2inputs;
    const bfs = new Queue<[any, TreeNode]>();
    const root: TreeNode = { content: -1, children: [] };
    bfs.enqueue([block, root]);
    while (!bfs.isEmpty) {
        const [blk, parent] = bfs.dequeue();
        const {type, fields, inputs, next} = blk;
        const o: {
            type: string;
            fields?: Record<string, any>;
            inputs: Record<string, any>;
        } = { type, fields, inputs: {} };

        if (inputs) {
            if (!type2inputs.has(type)) {
                type2inputs.set(type, Object.keys(inputs));
            }
            // Fill non-stmt inputs BEFORE serializing so they're captured in the hash.
            for (const __key of type2inputs.get(type)!) {
                if (!stmtSet.has(inputs[__key]?.block?.type)) {
                    o.inputs[__key] = serialize_inputs(inputs[__key].block);
                }
            }
        }

        const content = ctx.serialize(o);
        const node: TreeNode = { content, children: [] };
        parent.children.push(node);

        if (inputs) {
            for (const __key of type2inputs.get(type)!) {
                if (stmtSet.has(inputs[__key]?.block?.type)) {
                    bfs.enqueue([inputs[__key].block, node]);
                }
            }
        }

        if (next) {
            bfs.enqueue([next.block, parent]);
        }
    }
    return root;
}
type UnnormalizeResult = {
    tree: any;
    modeMap: Record<string, "insert" | "delete" | "common">;
};

export function unnormalize(root: TreeDiffNode, ctx: NormalizeContext): UnnormalizeResult {
    const modeMap: Record<string, "insert" | "delete" | "common"> = {};

    // Reconstruct expression block from serialize_inputs() output.
    // Format: { key: blockType, fields?: {...}, inputs?: { inputName: <recursive> } }
    function rebuildExpr(s: any, mode: "insert" | "delete" | "common"): any | undefined {
        if (!s?.key) return undefined;
        const id = crypto.randomUUID();
        modeMap[id] = mode;
        const block: any = { type: s.key, id };
        if (s.fields) block.fields = s.fields;
        const childInputs: Record<string, { block: any }> = {};
        for (const [k, child] of Object.entries(s.inputs ?? {})) {
            const childBlock = rebuildExpr(child, mode);
            if (childBlock) childInputs[k] = { block: childBlock };
        }
        if (Object.keys(childInputs).length > 0) block.inputs = childInputs;
        return block;
    }

    // Convert an array of sibling stmt nodes into a next-linked chain.
    function buildChain(nodes: TreeDiffNode[]): any | undefined {
        if (nodes.length === 0) return undefined;
        const block = buildBlock(nodes[0]);
        if (nodes.length > 1) block.next = { block: buildChain(nodes.slice(1)) };
        return block;
    }

    function buildBlock(node: TreeDiffNode): any {
        const dataStr = ctx.data2key.getByValue(node.content)!;
        const data = JSON.parse(dataStr) as {
            type: string;
            fields?: Record<string, any>;
            inputs: Record<string, any>;
        };

        const id = crypto.randomUUID();
        modeMap[id] = node.mode;

        const block: any = { type: data.type, id };
        if (data.fields) block.fields = data.fields;

        const inputs: Record<string, { block: any }> = {};

        // Expression inputs — reconstructed from serialized non-stmt data
        for (const [k, serialized] of Object.entries(data.inputs)) {
            const child = rebuildExpr(serialized, node.mode);
            if (child) inputs[k] = { block: child };
        }

        // Stmt inputs — reconstructed from tree children
        if (node.children.length > 0) {
            const allKeys = ctx.type2inputs.get(data.type) ?? [];
            const stmtKeys = allKeys.filter(k => !(k in data.inputs));
            if (stmtKeys.length === 1) {
                const chain = buildChain(node.children);
                if (chain) inputs[stmtKeys[0]] = { block: chain };
            } else if (stmtKeys.length > 1) {
                // BFS interleaves children across multiple stmt inputs;
                // assign one child per key and give the remainder to the last key.
                for (let i = 0; i < stmtKeys.length - 1 && i < node.children.length; i++) {
                    inputs[stmtKeys[i]] = { block: buildChain([node.children[i]]) };
                }
                const rest = node.children.slice(stmtKeys.length - 1);
                if (rest.length > 0)
                    inputs[stmtKeys[stmtKeys.length - 1]] = { block: buildChain(rest) };
            }
        }

        if (Object.keys(inputs).length > 0) block.inputs = inputs;
        return block;
    }

    const tree = buildChain(root.content === -1 ? root.children : [root]);
    return { tree, modeMap };
}