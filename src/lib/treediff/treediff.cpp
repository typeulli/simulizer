#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <functional>
#include <memory>
#include <tuple>
#include <unordered_map>
#include <unordered_set>
#include <vector>

using namespace emscripten;

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

struct Node {
    int content;
    std::vector<std::shared_ptr<Node>> children;

    int size() const {
        int s = 1;
        for (auto& c : children) s += c->size();
        return s;
    }

};

// ---------------------------------------------------------------------------
// DP helpers
// ---------------------------------------------------------------------------

using NodePtr = std::shared_ptr<Node>;
using DpKey   = std::pair<const Node*, const Node*>;

struct PairHash {
    size_t operator()(const DpKey& k) const {
        auto h1 = std::hash<const Node*>{}(k.first);
        auto h2 = std::hash<const Node*>{}(k.second);
        return h1 ^ (h2 * 2654435761u);
    }
};

using DpMap = std::unordered_map<DpKey, int, PairHash>;

static void postorder(const NodePtr& root, std::vector<NodePtr>& out) {
    for (auto& c : root->children) postorder(c, out);
    out.push_back(root);
}

using PreorderMap = std::unordered_map<const Node*, int>;

static void build_preorder(const NodePtr& node, PreorderMap& out, int& counter) {
    out[node.get()] = counter++;
    for (auto& c : node->children) build_preorder(c, out, counter);
}

// Weighted LCS table for two child sequences
static std::vector<std::vector<int>> lcs_table(
    const std::vector<NodePtr>& ca,
    const std::vector<NodePtr>& cb,
    const DpMap& dp)
{
    int p = (int)ca.size(), q = (int)cb.size();
    std::vector<std::vector<int>> L(p + 1, std::vector<int>(q + 1, 0));
    for (int i = 1; i <= p; ++i) {
        for (int j = 1; j <= q; ++j) {
            int best = std::max(L[i-1][j], L[i][j-1]);
            auto it = dp.find({ca[i-1].get(), cb[j-1].get()});
            if (it != dp.end() && it->second > 0)
                best = std::max(best, L[i-1][j-1] + it->second);
            L[i][j] = best;
        }
    }
    return L;
}

static DpMap compute_dp(const NodePtr& A, const NodePtr& B) {
    std::vector<NodePtr> nodesA, nodesB;
    postorder(A, nodesA);
    postorder(B, nodesB);

    DpMap dp;
    for (auto& v : nodesA) {
        for (auto& w : nodesB) {
            if (v->content == w->content) {
                auto L = lcs_table(v->children, w->children, dp);
                dp[{v.get(), w.get()}] =
                    1 + L[v->children.size()][w->children.size()];
            }
        }
    }
    return dp;
}

// ---------------------------------------------------------------------------
// Backtracking
// ---------------------------------------------------------------------------

// Maps each matched B node → its matched A counterpart
using MatchMap = std::unordered_map<const Node*, const Node*>;

static void backtrack(
    const NodePtr& v, const NodePtr& w,
    const DpMap& dp,
    std::unordered_set<const Node*>& matchedA,
    std::unordered_set<const Node*>& matchedB,
    MatchMap& bToA)
{
    auto it = dp.find({v.get(), w.get()});
    if (it == dp.end() || it->second == 0) return;

    matchedA.insert(v.get());
    matchedB.insert(w.get());
    bToA[w.get()] = v.get();

    auto L = lcs_table(v->children, w->children, dp);
    int i = (int)v->children.size(), j = (int)w->children.size();
    while (i > 0 && j > 0) {
        if (L[i][j] == L[i-1][j]) {
            --i;
        } else if (L[i][j] == L[i][j-1]) {
            --j;
        } else {
            backtrack(v->children[i-1], w->children[j-1], dp, matchedA, matchedB, bToA);
            --i; --j;
        }
    }
}

static std::tuple<std::unordered_set<const Node*>, std::unordered_set<const Node*>, MatchMap>
find_matching(const NodePtr& A, const NodePtr& B, const DpMap& dp) {
    std::unordered_set<const Node*> matchedA, matchedB;
    MatchMap bToA;
    auto it = dp.find({A.get(), B.get()});
    if (it != dp.end() && it->second > 0)
        backtrack(A, B, dp, matchedA, matchedB, bToA);
    return {matchedA, matchedB, bToA};
}

// ---------------------------------------------------------------------------
// Diff ops (returned as JS objects via val)
// ---------------------------------------------------------------------------

// parentIdx for both delete and insert ops is always A's preorder index.
// nodeIdx for insert ops is B's preorder index (used by JS to look up bNodes[]).

static void gen_deletes(
    const NodePtr& v,
    int parentIdx,
    const std::unordered_set<const Node*>& matchedA,
    const PreorderMap& preorderA,
    val& ops)
{
    for (int ci = 0; ci < (int)v->children.size(); ++ci) {
        auto& c = v->children[ci];
        if (!matchedA.count(c.get())) {
            val op = val::object();
            op.set("type",      val("delete"));
            op.set("parentIdx", val(parentIdx));
            op.set("childIdx",  val(ci));
            op.set("cost",      val(c->size()));
            ops.call<void>("push", op);
        } else {
            gen_deletes(c, preorderA.at(c.get()), matchedA, preorderA, ops);
        }
    }
}

static void gen_inserts(
    const NodePtr& w,
    int parentIdx,   // A's preorder index of w's matched counterpart in A
    const std::unordered_set<const Node*>& matchedB,
    const PreorderMap& preorderA,
    const PreorderMap& preorderB,
    const MatchMap& bToA,
    val& ops)
{
    for (int pos = 0; pos < (int)w->children.size(); ++pos) {
        auto& c = w->children[pos];
        if (!matchedB.count(c.get())) {
            val op = val::object();
            op.set("type",      val("insert"));
            op.set("parentIdx", val(parentIdx));
            op.set("childIdx",  val(pos));
            op.set("cost",      val(c->size()));
            op.set("nodeIdx",   val(preorderB.at(c.get())));
            ops.call<void>("push", op);
        } else {
            int aIdx = preorderA.at(bToA.at(c.get()));
            gen_inserts(c, aIdx, matchedB, preorderA, preorderB, bToA, ops);
        }
    }
}

// ---------------------------------------------------------------------------
// JS-facing Node builder
// ---------------------------------------------------------------------------

// Build a NodePtr from a JS object: { content: number, children?: [...] }
static NodePtr node_from_val(const val& obj) {
    auto n = std::make_shared<Node>();
    n->content = obj["content"].as<int>();

    val children = obj["children"];
    if (!children.isNull() && !children.isUndefined()) {
        int len = children["length"].as<int>();
        for (int i = 0; i < len; ++i)
            n->children.push_back(node_from_val(children[i]));
    }
    return n;
}

// ---------------------------------------------------------------------------
// Public API: treeDiff(A, B) -> { common, cost, ops[] }
// ---------------------------------------------------------------------------

val treeDiff(val jsA, val jsB) {
    NodePtr A = node_from_val(jsA);
    NodePtr B = node_from_val(jsB);

    DpMap dp = compute_dp(A, B);
    auto [matchedA, matchedB, bToA] = find_matching(A, B, dp);

    int common     = (int)matchedA.size();
    int total_cost = A->size() + B->size() - 2 * common;

    int cntA = 0, cntB = 0;
    PreorderMap preorderA, preorderB;
    build_preorder(A, preorderA, cntA);
    build_preorder(B, preorderB, cntB);

    val ops = val::array();

    // Deletes — parentIdx: A's preorder
    if (!matchedA.count(A.get())) {
        val op = val::object();
        op.set("type",      val("delete"));
        op.set("parentIdx", val(-1));
        op.set("childIdx",  val(0));
        op.set("cost",      val(A->size()));
        ops.call<void>("push", op);
    } else {
        gen_deletes(A, preorderA.at(A.get()), matchedA, preorderA, ops);
    }

    // Inserts — parentIdx: A's preorder of the matched counterpart; nodeIdx: B's preorder
    if (!matchedB.count(B.get())) {
        val op = val::object();
        op.set("type",      val("insert"));
        op.set("parentIdx", val(-1));
        op.set("childIdx",  val(0));
        op.set("cost",      val(B->size()));
        op.set("nodeIdx",   val(preorderB.at(B.get())));
        ops.call<void>("push", op);
    } else {
        gen_inserts(B, preorderA.at(bToA.at(B.get())), matchedB, preorderA, preorderB, bToA, ops);
    }

    val result = val::object();
    result.set("sizeA",      val(A->size()));
    result.set("sizeB",      val(B->size()));
    result.set("common",     val(common));
    result.set("cost",       val(total_cost));
    result.set("ops",        ops);
    return result;
}

EMSCRIPTEN_BINDINGS(treediff) {
    function("treeDiff", &treeDiff);
}
