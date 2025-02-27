import { isArray, isString, keys } from 'underscore';
import { Model, ObjectAny, ObjectHash, SetOptions } from '../../common';
import ParserHtml from '../../parser/model/ParserHtml';
import Selectors from '../../selector_manager/model/Selectors';
import { shallowDiff } from '../../utils/mixins';
import EditorModel from '../../editor/model/Editor';
import DataVariable, { DataVariableProps, DataVariableType } from '../../data_sources/model/DataVariable';
import DataResolverListener from '../../data_sources/model/DataResolverListener';
import CssRuleView from '../../css_composer/view/CssRuleView';
import ComponentView from '../../dom_components/view/ComponentView';
import Frame from '../../canvas/model/Frame';
import {
  DataCondition,
  DataConditionType,
  DataConditionProps,
} from '../../data_sources/model/conditional_variables/DataCondition';
import { isDataResolver, isDataResolverProps } from '../../data_sources/model/utils';
import { DataResolverProps } from '../../data_sources/types';

export type StyleProps = Record<string, string | string[] | DataVariableProps | DataConditionProps>;

export interface UpdateStyleOptions extends SetOptions {
  partial?: boolean;
  addStyle?: StyleProps;
  inline?: boolean;
  noEvent?: boolean;
}

export type StyleableView = ComponentView | CssRuleView;

const parserHtml = ParserHtml();

export const getLastStyleValue = (value: string | string[]) => {
  return isArray(value) ? value[value.length - 1] : value;
};

export default class StyleableModel<T extends ObjectHash = any> extends Model<T> {
  em?: EditorModel;
  views: StyleableView[] = [];
  styleResolverListeners: Record<string, DataResolverListener> = {};

  constructor(attributes: T, options: { em?: EditorModel } = {}) {
    super(attributes, options);
    this.em = options.em;
  }

  /**
   * Parse style string to an object
   * @param  {string} str
   * @returns
   */
  parseStyle(str: string) {
    return parserHtml.parseStyle(str);
  }

  /**
   * Trigger style change event with a new object instance
   * @param {Object} prop
   * @return {Object}
   */
  extendStyle(prop: ObjectAny): ObjectAny {
    return { ...this.getStyle('', { skipResolve: true }), ...prop };
  }

  /**
   * Get style object
   * @return {Object}
   */
  getStyle(prop?: string | ObjectAny, opts: { skipResolve?: boolean } = {}): StyleProps {
    const style = this.get('style') || {};
    const result: ObjectAny = { ...style };

    if (this.em && !opts.skipResolve) {
      const resolvedStyle = this.getResolvedStyles({ ...result });
      // @ts-ignore
      return prop && isString(prop) ? resolvedStyle[prop] : resolvedStyle;
    }

    return prop && isString(prop) ? result[prop] : result;
  }

  /**
   * Set new style object
   * @param {Object|string} prop
   * @param {Object} opts
   * @return {Object} Applied properties
   */
  setStyle(prop: string | ObjectAny = {}, opts: UpdateStyleOptions = {}) {
    if (isString(prop)) {
      prop = this.parseStyle(prop);
    }

    const propOrig = this.getStyle(opts);

    if (opts.partial || opts.avoidStore) {
      opts.avoidStore = true;
      prop.__p = true;
    } else {
      delete prop.__p;
    }

    const propNew = { ...prop };
    const newStyle = { ...propNew };

    keys(newStyle).forEach((key) => {
      // Remove empty style properties
      if (newStyle[key] === '') {
        delete newStyle[key];
        return;
      }

      const styleValue = newStyle[key];
      if (isDataResolverProps(styleValue)) {
        const dataResolver = this.getDataResolverInstance(styleValue);
        if (dataResolver) {
          newStyle[key] = dataResolver;
          this.listenToDataResolver(dataResolver, key);
        }
      }
    });

    this.set('style', newStyle, opts as any);

    const diff = shallowDiff(propOrig, newStyle);
    // Delete the property used for partial updates
    delete diff.__p;

    keys(diff).forEach((pr) => {
      const { em } = this;
      if (opts.noEvent) {
        return;
      }

      this.trigger(`change:style:${pr}`);
      if (em) {
        em.trigger('styleable:change', this, pr, opts);
        em.trigger(`styleable:change:${pr}`, this, pr, opts);
      }
    });

    return newStyle;
  }

  private getDataResolverInstance(props: DataResolverProps) {
    const em = this.em!;
    let resolver;

    switch (props.type) {
      case DataVariableType:
        resolver = new DataVariable(props, { em });
        break;
      case DataConditionType: {
        const { condition, ifTrue, ifFalse } = props;
        resolver = new DataCondition(condition, ifTrue, ifFalse, { em });
        break;
      }
    }

    return resolver;
  }

  listenToDataResolver(resolver: DataVariable | DataCondition, styleProp: string) {
    const resolverListener = this.styleResolverListeners[styleProp];
    if (resolverListener) {
      resolverListener.listenToResolver();
    } else {
      this.styleResolverListeners[styleProp] = new DataResolverListener({
        em: this.em!,
        resolver,
        onUpdate: () => this.updateView(),
      });
    }
  }

  getView(frame?: Frame) {
    let { views, em } = this;
    const frm = frame || em?.getCurrentFrameModel();
    return frm ? views.find((v) => v.frameView === frm.view) : views[0];
  }

  setView(view: StyleableView) {
    let { views } = this;
    !views.includes(view) && views.push(view);
  }

  removeView(view: StyleableView) {
    const { views } = this;
    views.splice(views.indexOf(view), 1);
  }

  updateView() {
    this.views.forEach((view) => view.updateStyles());
  }

  getResolvedStyles(style: StyleProps): StyleProps {
    const resultStyle = { ...style };

    keys(resultStyle).forEach((key) => {
      const styleValue = resultStyle[key];

      if (typeof styleValue === 'string' || Array.isArray(styleValue)) {
        return;
      }

      if (isDataResolverProps(styleValue)) {
        const resolver = this.getDataResolverInstance(styleValue);
        if (resolver) {
          resultStyle[key] = resolver.getDataValue();
        }
      }

      if (isDataResolver(styleValue)) {
        resultStyle[key] = styleValue.getDataValue();
      }
    });

    return resultStyle;
  }

  /**
   * Add style property
   * @param {Object|string} prop
   * @param {string} value
   * @example
   * this.addStyle({color: 'red'});
   * this.addStyle('color', 'blue');
   */
  addStyle(prop: string | ObjectAny, value: any = '', opts: UpdateStyleOptions = {}) {
    if (typeof prop == 'string') {
      prop = {
        [prop]: value,
      };
    } else {
      opts = value || {};
    }

    opts.addStyle = prop;
    prop = this.extendStyle(prop);
    this.setStyle(prop, opts);
  }

  /**
   * Remove style property
   * @param {string} prop
   */
  removeStyle(prop: string) {
    let style = this.getStyle();
    delete style[prop];
    this.setStyle(style);
  }

  /**
   * Returns string of style properties
   * @param {Object} [opts={}] Options
   * @return {String}
   */
  styleToString(opts: ObjectAny = {}) {
    const result: string[] = [];
    const style = this.getStyle(opts);
    const imp = opts.important;

    for (let prop in style) {
      const important = isArray(imp) ? imp.indexOf(prop) >= 0 : imp;
      const firstChars = prop.substring(0, 2);
      const isPrivate = firstChars === '__';

      if (isPrivate) continue;

      const value = style[prop];
      const values = isArray(value) ? (value as string[]) : [value];

      (values as string[]).forEach((val: string) => {
        const value = `${val}${important ? ' !important' : ''}`;
        value && result.push(`${prop}:${value};`);
      });
    }

    return result.join('');
  }

  getSelectors() {
    return (this.get('selectors') || this.get('classes')) as Selectors;
  }

  getSelectorsString(opts?: ObjectAny) {
    // @ts-ignore
    return this.selectorsToString ? this.selectorsToString(opts) : this.getSelectors().getFullString();
  }
}
