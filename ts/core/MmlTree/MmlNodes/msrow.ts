import { PropertyList } from "../../Tree/Node.js";
import {
  MmlNode,
  AbstractMmlNode,
  AttributeList,
  TEXCLASS,
  indentAttributes,
} from "../MmlNode.js";
import { split } from "../../../util/string.js";

/*****************************************************************/
/**
 *  Implements the MmlMtable node class (subclass of AbstractMmlNode)
 */

export class MmlMsrow extends AbstractMmlNode {
  /**
   * @override
   */
  public static defaults: PropertyList = {
    ...AbstractMmlNode.defaults,
    align: "axis",
    stackalign: "right",
    charalign: "center",
    charspacing: "medium",
  };

  /**
   * Extra properties for this node
   */
  public properties = {
    useHeight: 1,
  };

  /**
   * TeX class is ORD
   */
  public texClass = TEXCLASS.ORD;

  /**
   * @override
   */
  public get kind() {
    return "msrow";
  }

  /**
   * Linebreaks are allowed in tables
   * @override
   */
  public get linebreakContainer() {
    return true;
  }

  /**
   * @override
   */
  // public setInheritedAttributes(
  //   attributes: AttributeList,
  //   display: boolean,
  //   level: number,
  //   prime: boolean
  // ) {
  //   //
  //   // Force inheritance of shift and align values (since they are needed to output tables with labels)
  //   //   but make sure they are not given explicitly on the <mtable> tag.
  //   //
  //   for (const name of indentAttributes) {
  //     if (attributes[name]) {
  //       this.attributes.setInherited(name, attributes[name][1]);
  //     }
  //     if (this.attributes.getExplicit(name) !== undefined) {
  //       delete this.attributes.getAllAttributes()[name];
  //     }
  //   }
  //   super.setInheritedAttributes(attributes, display, level, prime);
  // }

  /**
   * Make sure all children are mtr or mlabeledtr nodes
   * Inherit the table attributes, and set the display attribute based on the table's displaystyle attribute
   *
   * @override
   */
  // protected setChildInheritedAttributes(
  //   attributes: AttributeList,
  //   display: boolean,
  //   level: number,
  //   prime: boolean
  // ) {
  //   for (const child of this.childNodes) {
  //     if (!child.isKind("mtr")) {
  //       this.replaceChild(this.factory.create("mtr"), child).appendChild(child);
  //     }
  //   }
  //   display = !!(
  //     this.attributes.getExplicit("displaystyle") ||
  //     this.attributes.getDefault("displaystyle")
  //   );
  //   attributes = this.addInheritedAttributes(attributes, {
  //     columnalign: this.attributes.get("columnalign"),
  //     rowalign: "center",
  //   });
  //   const ralign = split(this.attributes.get("rowalign") as string);
  //   for (const child of this.childNodes) {
  //     attributes.rowalign[1] = ralign.shift() || attributes.rowalign[1];
  //     child.setInheritedAttributes(attributes, display, level, prime);
  //   }
  // }

  /**
   * Check that children are mtr or mlabeledtr
   *
   * @override
   */
  // protected verifyChildren(options: PropertyList) {
  //   if (!options["fixMtables"]) {
  //     for (const child of this.childNodes) {
  //       if (!child.isKind("mtr")) {
  //         this.mError(
  //           "Children of " + this.kind + " must be mtr or mlabeledtr",
  //           options
  //         );
  //       }
  //     }
  //   }
  //   super.verifyChildren(options);
  // }

  /**
   * @override
   */
  public setTeXclass(prev: MmlNode) {
    this.getPrevClass(prev);
    for (const child of this.childNodes) {
      child.setTeXclass(null);
    }
    return this;
  }
}
