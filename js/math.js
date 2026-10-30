/* 小数は整数の目盛り（1/10 または 1/100）で計算し、丸め誤差を防ぎます。 */
(() => {
  "use strict";
  const P = globalThis.PopEscape;
  const integer = (min, max, rng) => min + Math.floor(rng() * (max - min + 1));
  function shuffle(values, rng) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = integer(0, i, rng);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function format(ticks, scale = 1) {
    return (ticks / scale)
      .toFixed(scale === 100 ? 2 : scale === 10 ? 1 : 0)
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "");
  }
  function generateQuestion(grade = 3, choiceCount = 2, rng = Math.random) {
    if (![3, 4].includes(grade) || ![2, 3].includes(choiceCount))
      throw new RangeError("学年は3・4、選択肢は2・3を指定してください。");
    const kind = integer(0, 2, rng);
    let a,
      b,
      answer,
      operator,
      scale = 1;
    if (kind === 0) {
      a = integer(grade === 3 ? 2 : 12, grade === 3 ? 9 : 49, rng);
      b = integer(2, grade === 3 ? 9 : 12, rng);
      answer = a * b;
      operator = "×";
    } else if (kind === 1) {
      b = integer(2, grade === 3 ? 9 : 15, rng);
      answer = integer(2, grade === 3 ? 9 : 24, rng);
      a = answer * b;
      operator = "÷";
    } else {
      scale = grade === 3 ? 10 : 100;
      a = integer(1, grade === 3 ? 49 : 999, rng);
      b = integer(1, grade === 3 ? 49 : 499, rng);
      operator = rng() < 0.5 ? "+" : "−";
      if (operator === "−" && a < b) [a, b] = [b, a];
      answer = operator === "+" ? a + b : a - b;
    }
    const options = new Set([answer]);
    const offsets = shuffle(
      scale === 1
        ? [1, -1, 2, -2, b, -b, 10, -10]
        : [1, -1, 10, -10, scale, -scale],
      rng,
    );
    for (const offset of offsets) {
      if (answer + offset >= 0) options.add(answer + offset);
      if (options.size === choiceCount) break;
    }
    for (let offset = 1; options.size < choiceCount; offset++)
      options.add(answer + offset);
    return {
      grade,
      kind: ["multiply", "divide", "decimal"][kind],
      a,
      b,
      operator,
      scale,
      expression: `${format(a, scale)} ${operator} ${format(b, kind === 2 ? scale : 1)} = ?`,
      answer,
      choices: shuffle([...options], rng).map((value) => ({
        value,
        label: format(value, scale),
      })),
    };
  }
  function isCorrect(question, index) {
    return (
      Number.isInteger(index) &&
      question.choices[index]?.value === question.answer
    );
  }
  P.MathQuiz = Object.freeze({ generateQuestion, isCorrect, format });
})();
