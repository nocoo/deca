/**
 * LRU Cache (Least Recently Used Cache)
 * 
 * 设计思路：
 * 1. 使用 Map 作为底层数据结构 - JavaScript 的 Map 保持插入顺序，迭代时按插入顺序遍历
 * 2. get/put 操作天然 O(1) - Map 的 get/set 操作是哈希表实现
 * 3. Map 的迭代顺序天然符合 LRU 语义 - 最新的条目在后面，get 后重新插入即可更新顺序
 * 
 * 为什么 Map 比链表+哈希表更简洁：
 * - 链表+哈希表：需要维护节点关系，删除节点需要 O(1) 但代码复杂
 * - Map：天然有序，get 后重新 set 即移动到末尾，代码简洁且性能同样优秀
 */
export class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number = 100) {
    if (maxSize <= 0) {
      throw new Error('Cache size must be greater than 0');
    }
    this.maxSize = maxSize;
    this.cache = new Map<K, V>();
  }

  /**
   * 获取缓存值
   * 
   * 复杂度：O(1)
   * 原因：Map.get() 是哈希表操作
   * 
   * 副作用：访问后将该键值对移动到末尾（最新位置）
   * 原因：Map 保持插入顺序，get 后重新 set 会更新顺序
   */
  get(key: K): V | undefined {
    if (!this.cache.has(key)) {
      return undefined;
    }
    
    // 获取值后重新插入，使该键成为最新的
    const value = this.cache.get(key)!;
    this.cache.delete(key);
    this.cache.set(key, value);
    
    return value;
  }

  /**
   * 设置缓存值
   * 
   * 复杂度：O(1)
   * 原因：Map.set() 是哈希表操作
   * 
   * 逻辑：
   * 1. 如果 key 已存在：删除旧条目，重新插入（更新位置到末尾）
   * 2. 如果 key 不存在：直接插入
   * 3. 超出容量时：删除最久未使用的条目（Map 第一个条目）
   */
  put(key: K, value: V): void {
    // 如果 key 已存在，先删除旧条目（位置会更新）
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // 插入新条目，会成为最新的（位于 Map 末尾）
    this.cache.set(key, value);
    
    // 检查是否超出容量，删除最久未使用的条目
    // Map 的第一个条目是最久未访问的，符合 LRU 语义
    if (this.cache.size > this.maxSize) {
      // Map.keys().next().value 获取第一个键
      // size > maxSize > 0，所以 Map 非空，firstKey 一定有值
      const firstKey = this.cache.keys().next().value as K;
      this.cache.delete(firstKey);
    }
  }

  /**
   * 检查 key 是否存在于缓存中
   * 复杂度：O(1)
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * 删除指定 key 的缓存
   * 复杂度：O(1)
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取当前缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 获取所有缓存键（按使用顺序，最新在前）
   * 用于调试或遍历
   */
  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  /**
   * 获取所有缓存值（按使用顺序）
   */
  values(): IterableIterator<V> {
    return this.cache.values();
  }

  /**
   * 获取所有键值对（按使用顺序）
   */
  entries(): IterableIterator<[K, V]> {
    return this.cache.entries();
  }
}

/**
 * 使用示例
 * 
 * ```typescript
 * const cache = new LRUCache<string, number>(3);
 * 
 * cache.put('a', 1);
 * cache.put('b', 2);
 * cache.put('c', 3);
 * 
 * console.log(cache.get('a')); // 1，访问后 'a' 成为最新的
 * 
 * cache.put('d', 4); // 超出容量，删除最久未使用的 'b'
 * 
 * console.log(cache.has('b')); // false，已被淘汰
 * console.log(cache.has('a')); // true，仍在缓存中
 * console.log(cache.get('a')); // 1
 * ```
 */
