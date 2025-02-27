import { isArray, isString, keys } from 'underscore';
import Component, { keySymbol, keySymbolOvrd, keySymbols } from './Component';
import { SymbolToUpOptions } from './types';
import { isEmptyObj } from '../../utils/mixins';
import Components from './Components';
import {
  DataCollectionVariableType,
  keyCollectionDefinition,
} from '../../data_sources/model/data_collection/constants';

export const isSymbolMain = (cmp: Component) => isArray(cmp.get(keySymbols));

export const isSymbolInstance = (cmp: Component) => !!cmp.get(keySymbol);

export const isSymbol = (cmp: Component) => !!(isSymbolMain(cmp) || isSymbolInstance(cmp));

export const isSymbolRoot = (symbol: Component) => {
  const parent = symbol.parent();
  return isSymbol(symbol) && (!parent || !isSymbol(parent));
};

export const isSymbolNested = (symbol: Component) => {
  if (!isSymbol(symbol)) return false;
  const symbTopSelf = getSymbolTop(isSymbolMain(symbol) ? symbol : getSymbolMain(symbol)!);
  const symbTop = getSymbolTop(symbol);
  const symbTopMain = isSymbolMain(symbTop) ? symbTop : getSymbolMain(symbTop);
  return symbTopMain !== symbTopSelf;
};

export const initSymbol = (symbol: Component) => {
  if (symbol.__symbReady) return;
  symbol.on('change', symbol.__upSymbProps);
  symbol.__symbReady = true;
};

export const getSymbolMain = (symbol: Component): Component | undefined => {
  let result = symbol.get(keySymbol);

  if (result && isString(result)) {
    const ref = symbol.__getAllById()[result];
    if (ref) {
      result = ref;
      symbol.set(keySymbol, ref);
    } else {
      result = 0;
    }
  }

  return result || undefined;
};

export const getSymbolInstances = (symbol?: Component): Component[] | undefined => {
  let symbs = symbol?.get(keySymbols);

  if (symbs && isArray(symbs)) {
    symbs.forEach((symb, idx) => {
      if (symb && isString(symb)) {
        symbs[idx] = symbol!.__getAllById()[symb];
      }
    });
    symbs = symbs.filter((symb) => symb && !isString(symb));
  }

  return symbs || undefined;
};

export const isSymbolOverride = (symbol?: Component, prop = '') => {
  const ovrd = symbol?.get(keySymbolOvrd);
  const [prp] = prop.split(':');
  const props = prop !== prp ? [prop, prp] : [prop];
  return ovrd === true || (isArray(ovrd) && props.some((p) => ovrd.indexOf(p) >= 0));
};

export const getSymbolsToUpdate = (symb: Component, opts: SymbolToUpOptions = {}) => {
  let result: Component[] = [];
  const { changed } = opts;

  if (
    opts.fromInstance ||
    opts.noPropagate ||
    opts.fromUndo ||
    // Avoid updating others if the current component has override
    (changed && isSymbolOverride(symb, changed))
  ) {
    return result;
  }

  const symbols = getSymbolInstances(symb) || [];
  const symbol = getSymbolMain(symb);
  const all = symbol ? [symbol, ...(getSymbolInstances(symbol) || [])] : symbols;
  result = all
    .filter((s) => s !== symb)
    // Avoid updating those with override
    .filter((s) => !(changed && isSymbolOverride(s, changed)));

  return result;
};

export const getSymbolTop = (symbol: Component, opts?: any) => {
  let result = symbol;
  let parent = symbol.parent(opts);

  // while (parent && (isSymbolMain(parent) || getSymbol(parent))) {
  while (parent && isSymbol(parent)) {
    result = parent;
    parent = parent.parent(opts);
  }

  return result;
};

export const detachSymbolInstance = (symbol: Component, opts: { skipRefs?: boolean } = {}) => {
  const symbolMain = getSymbolMain(symbol);
  const symbs = symbolMain && getSymbolInstances(symbolMain);
  !opts.skipRefs &&
    symbs &&
    symbolMain.set(
      keySymbols,
      symbs.filter((s) => s !== symbol),
    );
  symbol.set(keySymbol, 0);
  symbol.components().forEach((s) => detachSymbolInstance(s, opts));
};

export const logSymbol = (symb: Component, type: string, toUp: Component[], opts: any = {}) => {
  const symbol = getSymbolMain(symb);
  const symbols = getSymbolInstances(symb);

  if (!symbol && !symbols) {
    return;
  }

  symb.em.log(type, { model: symb, toUp, context: 'symbols', opts });
};

export const updateSymbolProps = (symbol: Component, opts: SymbolToUpOptions = {}): void => {
  const changed = symbol.dataResolverWatchers.getPropsDefsOrValues({ ...symbol.changedAttributes() });
  const attrs = symbol.dataResolverWatchers.getAttributesDefsOrValues({ ...changed.attributes });

  cleanChangedProperties(changed, attrs);

  if (!isEmptyObj(changed)) {
    const toUpdate = getSymbolsToUpdate(symbol, opts);

    // Filter properties to propagate
    filterPropertiesForPropagation(changed, symbol);

    logSymbol(symbol, 'props', toUpdate, { opts, changed });

    // Update child symbols
    toUpdate.forEach((child) => {
      const propsToUpdate = { ...changed };
      filterPropertiesForPropagation(propsToUpdate, child);
      child.set(propsToUpdate, { fromInstance: symbol, ...opts });
    });
  }
};

const cleanChangedProperties = (changed: Record<string, any>, attrs: Record<string, any>): void => {
  const keysToDelete = ['status', 'open', keySymbols, keySymbol, keySymbolOvrd, 'attributes'];
  keysToDelete.forEach((key) => delete changed[key]);
  delete attrs.id;

  if (!isEmptyObj(attrs)) {
    changed.attributes = attrs;
  }
};

const filterPropertiesForPropagation = (props: Record<string, any>, component: Component): void => {
  keys(props).forEach((prop) => {
    if (!shouldPropagateProperty(props, prop, component)) {
      delete props[prop];
    }
  });
};

const shouldPropagateProperty = (props: Record<string, any>, prop: string, component: Component): boolean => {
  const isCollectionVariableDefinition = (() => {
    if (prop === 'attributes') {
      const attributes = props['attributes'];
      return Object.values(attributes).some((attr: any) => attr?.type === DataCollectionVariableType);
    }

    return props[prop]?.type === DataCollectionVariableType;
  })();

  return !isSymbolOverride(component, prop) || isCollectionVariableDefinition;
};

export const updateSymbolCls = (symbol: Component, opts: any = {}) => {
  const toUp = getSymbolsToUpdate(symbol, opts);
  logSymbol(symbol, 'classes', toUp, { opts });
  toUp.forEach((child) => {
    // @ts-ignore This will propagate the change up to __upSymbProps
    child.set('classes', symbol.get('classes'), { fromInstance: symbol });
  });
  symbol.__changesUp(opts);
};

export const updateSymbolComps = (symbol: Component, m: Component, c: Components, o: any) => {
  const optUp = o || c || {};
  const { fromInstance, fromUndo } = optUp;
  const toUpOpts = { fromInstance, fromUndo };
  const isTemp = m.opt.temporary;

  // Reset
  if (!o) {
    const coll = m as unknown as Components;
    const toUp = getSymbolsToUpdate(symbol, {
      ...toUpOpts,
      changed: 'components:reset',
    });
    const cmps = coll.models;
    const newSymbols = new Set<Component>();
    logSymbol(symbol, 'reset', toUp, { components: cmps });

    toUp.forEach((rel) => {
      const relCmps = rel.components();
      const toReset = cmps.map((cmp, i) => {
        if (symbol.get(keyCollectionDefinition)) {
          return cmp.clone({ symbol: isSymbol(cmp) });
        }
        // This particular case here is to handle reset from `resetFromString`
        // where we can receive an array of regulat components or already
        // existing symbols (updated already before reset)
        if (!isSymbol(cmp) || newSymbols.has(cmp)) {
          newSymbols.add(cmp);
          return cmp.clone({ symbol: true });
        }
        return relCmps.at(i);
      });

      relCmps.reset(toReset, { fromInstance: symbol, ...c } as any);
    });
    // Add
  } else if (o.add) {
    let addedInstances: Component[] = [];
    const isMainSymb = !!getSymbolInstances(symbol);
    const toUp = getSymbolsToUpdate(symbol, {
      ...toUpOpts,
      changed: 'components:add',
    });
    if (toUp.length) {
      const addSymb = getSymbolMain(m);
      addedInstances = (addSymb ? getSymbolInstances(addSymb) : getSymbolInstances(m)) || [];
      addedInstances = [...addedInstances];
      addedInstances.push(addSymb ? addSymb : m);
    }
    !isTemp &&
      logSymbol(symbol, 'add', toUp, {
        opts: o,
        addedInstances: addedInstances.map((c) => c.cid),
        added: m.cid,
      });
    // Here, before appending a new symbol, I have to ensure there are no previously
    // created symbols (eg. used mainly when drag components around)
    toUp.forEach((symb) => {
      const symbTop = getSymbolTop(symb);
      const symbPrev = addedInstances.filter((addedInst) => {
        const addedTop = getSymbolTop(addedInst, { prev: 1 });
        return symbTop && addedTop && addedTop === symbTop;
      })[0];
      const toAppend = symbPrev || m.clone({ symbol: true, symbolInv: isMainSymb });
      symb.append(toAppend, { fromInstance: symbol, ...o });
    });
    // Remove
  } else {
    // Remove instance reference from the symbol
    const symb = getSymbolMain(m);
    symb &&
      !o.temporary &&
      symb.set(
        keySymbols,
        getSymbolInstances(symb)!.filter((i) => i !== m),
      );

    // Propagate remove only if the component is an inner symbol
    if (!isSymbolRoot(m) && !o.skipRefsUp) {
      const changed = 'components:remove';
      const { index } = o;
      const parent = m.parent();
      const opts = { fromInstance: m, ...o };
      const isSymbNested = isSymbolRoot(m);
      let toUpFn = (symb: Component) => {
        const symbPrnt = symb.parent();
        symbPrnt && !isSymbolOverride(symbPrnt, changed) && symb.remove(opts);
      };
      // Check if the parent allows the removing
      let toUp = !isSymbolOverride(parent, changed) ? getSymbolsToUpdate(m, toUpOpts) : [];

      if (isSymbNested) {
        toUp = parent! && getSymbolsToUpdate(parent, { ...toUpOpts, changed })!;
        toUpFn = (symb) => {
          const toRemove = symb.components().at(index);
          toRemove && toRemove.remove({ fromInstance: parent, ...opts });
        };
      }

      !isTemp &&
        logSymbol(symbol, 'remove', toUp, {
          opts: o,
          removed: m.cid,
          isSymbNested,
        });
      toUp.forEach(toUpFn);
    }
  }

  symbol.__changesUp(optUp);
};
