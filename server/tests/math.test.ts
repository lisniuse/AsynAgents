import { describe, it, expect } from 'vitest';

// 示例函数
function add(a: number, b: number): number {
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('除数不能为零');
  }
  return a / b;
}

describe('数学运算测试', () => {
  describe('add 函数', () => {
    it('应该正确计算两个正数相加', () => {
      expect(add(2, 3)).toBe(5);
    });

    it('应该正确计算负数相加', () => {
      expect(add(-1, -1)).toBe(-2);
    });

    it('应该正确计算正负数相加', () => {
      expect(add(5, -3)).toBe(2);
    });

    it('应该正确处理零', () => {
      expect(add(0, 0)).toBe(0);
      expect(add(5, 0)).toBe(5);
    });
  });

  describe('subtract 函数', () => {
    it('应该正确计算减法', () => {
      expect(subtract(5, 3)).toBe(2);
    });

    it('应该正确处理负数结果', () => {
      expect(subtract(3, 5)).toBe(-2);
    });
  });

  describe('multiply 函数', () => {
    it('应该正确计算乘法', () => {
      expect(multiply(3, 4)).toBe(12);
    });

    it('应该正确处理乘以零', () => {
      expect(multiply(5, 0)).toBe(0);
    });

    it('应该正确处理负数乘法', () => {
      expect(multiply(-2, 3)).toBe(-6);
      expect(multiply(-2, -3)).toBe(6);
    });
  });

  describe('divide 函数', () => {
    it('应该正确计算除法', () => {
      expect(divide(10, 2)).toBe(5);
    });

    it('应该正确处理小数结果', () => {
      expect(divide(7, 2)).toBe(3.5);
    });

    it('当除数为零时应该抛出错误', () => {
      expect(() => divide(10, 0)).toThrow('除数不能为零');
    });
  });
});
