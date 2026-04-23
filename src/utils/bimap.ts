/**
 * Bidirectional map that maintains a one-to-one mapping between keys and values.
 * 
 * Each key maps to exactly one value, and each value maps back to exactly one key.
 * Setting a new value to an existing key or vice versa automatically removes the old mapping.
 * 
 * @template K The type of keys
 * @template V The type of values
 */
export default class BiMap<K, V> {
    /** Map from keys to values */
    private kv = new Map<K, V>();
    /** Map from values to keys (inverse mapping) */
    private vk = new Map<V, K>();

    /**
     * Returns the number of key-value pairs in the BiMap.
     * @returns The size of the BiMap
     */
    get size(): number {
        return this.kv.size;
    }

    /**
     * Checks if a key exists in the BiMap.
     * @param key The key to check
     * @returns true if the key exists, false otherwise
     */
    hasKey(key: K): boolean {
        return this.kv.has(key);
    }

    /**
     * Checks if a value exists in the BiMap.
     * @param value The value to check
     * @returns true if the value exists, false otherwise
     */
    hasValue(value: V): boolean {
        return this.vk.has(value);
    }

    /**
     * Retrieves the value associated with the given key.
     * @param key The key to look up
     * @returns The value associated with the key, or undefined if not found
     */
    getByKey(key: K): V | undefined {
        return this.kv.get(key);
    }

    /**
     * Retrieves the key associated with the given value.
     * @param value The value to look up
     * @returns The key associated with the value, or undefined if not found
     */
    getByValue(value: V): K | undefined {
        return this.vk.get(value);
    }

    /**
     * Sets a key-value pair in the BiMap.
     * 
     * Maintains the bijection invariant by automatically removing conflicting mappings:
     * - If the key already exists with a different value, the old mapping is removed
     * - If the value already exists with a different key, the old mapping is removed
     * 
     * @param key The key to set
     * @param value The value to set
     */
    set(key: K, value: V): void {
        const existingValue = this.kv.get(key);
        const existingKey = this.vk.get(value);

        // Already the same mapping, no-op
        if (existingValue === value) return;

        // Remove conflicting mappings to maintain bijection
        if (existingValue !== undefined) {
            this.vk.delete(existingValue);
        }
        if (existingKey !== undefined) {
            this.kv.delete(existingKey);
        }

        this.kv.set(key, value);
        this.vk.set(value, key);
    }

    /**
     * Removes the mapping associated with the given key.
     * @param key The key to delete
     * @returns true if a mapping was deleted, false if the key was not found
     */
    deleteByKey(key: K): boolean {
        const value = this.kv.get(key);
        if (value === undefined) return false;

        this.kv.delete(key);
        this.vk.delete(value);
        return true;
    }

    /**
     * Removes the mapping associated with the given value.
     * @param value The value to delete
     * @returns true if a mapping was deleted, false if the value was not found
     */
    deleteByValue(value: V): boolean {
        const key = this.vk.get(value);
        if (key === undefined) return false;

        this.vk.delete(value);
        this.kv.delete(key);
        return true;
    }

    /**
     * Removes all mappings from the BiMap.
     */
    clear(): void {
        this.kv.clear();
        this.vk.clear();
    }

    /**
     * Returns an iterator of all [key, value] pairs in the BiMap.
     * @returns An iterator yielding [key, value] tuples
     */
    entries(): IterableIterator<[K, V]> {
        return this.kv.entries();
    }

    /**
     * Returns an iterator of all keys in the BiMap.
     * @returns An iterator yielding all keys
     */
    keys(): IterableIterator<K> {
        return this.kv.keys();
    }

    /**
     * Returns an iterator of all values in the BiMap.
     * @returns An iterator yielding all values
     */
    values(): IterableIterator<V> {
        return this.kv.values();
    }
}