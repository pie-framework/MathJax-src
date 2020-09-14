// tslint:disable: quotemark
import { MathML } from "../ts/input/mathml";
import { mathjax } from "../ts/mathjax";
import { RegisterHTMLHandler } from "../ts/handlers/html";
import { browserAdaptor } from "../ts/adaptors/browserAdaptor";

import { CHTML } from "../ts/output/chtml";
// const mml = new MathML({});
const handler = RegisterHTMLHandler(browserAdaptor());
// console.log(mml);
console.log("handler:", handler);
const mmlConfig = {};
const fontURL = `https://unpkg.com/mathjax-full@latest/ts/output/chtml/fonts/tex-woff-v2`;

// const fontURL = `https://unpkg.com/mathjax-full@${mathjax.version}/ts/output/chtml/fonts/tex-woff-v2`;
const htmlConfig = { fontURL };
export const compileMath = (doc) => {
  const html = mathjax.document(document, {
    InputJax: [new MathML(mmlConfig)],
    OutputJax: new CHTML(htmlConfig),
  });
  // console.log(d);

  html.findMath().compile().getMetrics().typeset().updateDocument().clear();

  // d.compile();
  // const found = mml.findMath(document);

  // console.log(found);
  // const result = mml.compile(doc);

  // console.log("result:", result);
};
