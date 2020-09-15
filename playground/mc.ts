// tslint:disable: quotemark
import { MathML } from '../ts/input/mathml';
import { mathjax } from '../ts/mathjax';
import { RegisterHTMLHandler } from '../ts/handlers/html';
import { browserAdaptor } from '../ts/adaptors/browserAdaptor';

import { CHTML } from '../ts/output/chtml';
import { HTMLMathItem } from '../ts/handlers/html/HTMLMathItem';

import MStack from './els/mstack';

// customElements.define('mjx-mstack', MStack);

// const mml = new MathML({});
const handler = RegisterHTMLHandler(browserAdaptor());
// console.log(mml);
console.log('handler:', handler);
const mmlConfig = {};
const fontURL = `https://unpkg.com/mathjax-full@latest/ts/output/chtml/fonts/tex-woff-v2`;

// const fontURL = `https://unpkg.com/mathjax-full@${mathjax.version}/ts/output/chtml/fonts/tex-woff-v2`;
const htmlConfig = { fontURL };
export const compileMath = (doc) => {
  const chtml = new CHTML(htmlConfig);

  // set a new factory that has mstack
  chtml.factory = {} as any;
  const inputJax = new MathML(mmlConfig);

  // set custom mml factory that has mstack
  inputJax.setMmlFactory({} as any);
  const html = mathjax.document(document, {
    InputJax: [inputJax],
    OutputJax: chtml,
  });
  // console.log(d);

  html.findMath().compile().getMetrics().typeset().updateDocument().clear();

  // const math = `<math xmlns="http://www.w3.org/1998/Math/MathML">
  //       <mstack charalign="center" stackalign="right">
  //         <mn>3589</mn>
  //         <msrow>
  //           <mo>+</mo>
  //           <mn>5123</mn>
  //         </msrow>
  //         <msline></msline>
  //         <msrow></msrow>
  //       </mstack>
  //     </math>`;
  // const item = new HTMLMathItem(math, inputJax);
  // (item as any).root = { setTeXclass: () => {} };
  // console.log("item:", item);

  // const o = chtml.typeset(item, html);
  // console.log("o:", o);
  // const items = html.getH(html.document);
  // console.log("items:", items);
  // const out = chtml.typeset(items[0], html);
  // console.log("out:", out);
  // d.compile();
  // const found = mml.findMath(document);

  // console.log(found);
  // const result = mml.compile(doc);

  // console.log("result:", result);
};
