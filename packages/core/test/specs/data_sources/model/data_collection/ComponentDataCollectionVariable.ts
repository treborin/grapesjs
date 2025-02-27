import { Component, DataRecord, DataSource, DataSourceManager, Editor } from '../../../../../src';
import { DataVariableType } from '../../../../../src/data_sources/model/DataVariable';
import {
  DataCollectionType,
  DataCollectionVariableType,
} from '../../../../../src/data_sources/model/data_collection/constants';
import { DataCollectionStateVariableType } from '../../../../../src/data_sources/model/data_collection/types';
import EditorModel from '../../../../../src/editor/model/Editor';
import { ProjectData } from '../../../../../src/storage_manager';
import { setupTestEditor } from '../../../../common';

describe('Collection variable components', () => {
  let em: EditorModel;
  let editor: Editor;
  let dsm: DataSourceManager;
  let dataSource: DataSource;
  let wrapper: Component;
  let firstRecord: DataRecord;
  let secondRecord: DataRecord;

  beforeEach(() => {
    ({ em, editor, dsm } = setupTestEditor());
    wrapper = em.getWrapper()!;
    dataSource = dsm.add({
      id: 'my_data_source_id',
      records: [
        { id: 'user1', user: 'user1', age: '12' },
        { id: 'user2', user: 'user2', age: '14' },
        { id: 'user3', user: 'user3', age: '16' },
      ],
    });

    firstRecord = dataSource.getRecord('user1')!;
    secondRecord = dataSource.getRecord('user2')!;
  });

  afterEach(() => {
    em.destroy();
  });

  test('Gets the correct static value', async () => {
    const cmp = wrapper.components({
      type: DataCollectionType,
      collectionDef: {
        componentDef: {
          type: 'default',
          components: [
            {
              type: DataCollectionVariableType,
              variableType: DataCollectionStateVariableType.currentItem,
              collectionId: 'my_collection',
              path: 'user',
            },
          ],
        },
        collectionConfig: {
          collectionId: 'my_collection',
          dataSource: {
            type: DataVariableType,
            path: 'my_data_source_id',
          },
        },
      },
    })[0];

    const firstGrandchild = cmp.components().at(0).components().at(0);
    expect(firstGrandchild.getInnerHTML()).toContain('user1');
    expect(firstGrandchild.getEl()?.innerHTML).toContain('user1');

    const secondGrandchild = cmp.components().at(1).components().at(0);
    expect(secondGrandchild.getInnerHTML()).toContain('user2');
    expect(secondGrandchild.getEl()?.innerHTML).toContain('user2');
  });

  test('Watches collection variable changes', async () => {
    const cmp = wrapper.components({
      type: DataCollectionType,
      collectionDef: {
        componentDef: {
          type: 'default',
          components: {
            type: DataCollectionVariableType,
            variableType: DataCollectionStateVariableType.currentItem,
            collectionId: 'my_collection',
            path: 'user',
          },
        },
        collectionConfig: {
          collectionId: 'my_collection',
          dataSource: {
            type: DataVariableType,
            path: 'my_data_source_id',
          },
        },
      },
    })[0];
    firstRecord.set('user', 'new_correct_value');

    const firstGrandchild = cmp.components().at(0).components().at(0);
    expect(firstGrandchild.getInnerHTML()).toContain('new_correct_value');
    expect(firstGrandchild.getEl()?.innerHTML).toContain('new_correct_value');

    const secondGrandchild = cmp.components().at(1).components().at(0);
    expect(secondGrandchild.getInnerHTML()).toContain('user2');
    expect(secondGrandchild.getEl()?.innerHTML).toContain('user2');
  });

  describe('Serialization', () => {
    let cmp: Component;

    beforeEach(() => {
      const variableCmpDef = {
        type: DataCollectionVariableType,
        variableType: DataCollectionStateVariableType.currentItem,
        collectionId: 'my_collection',
        path: 'user',
      };

      const collectionComponentDefinition = {
        type: DataCollectionType,
        collectionDef: {
          componentDef: {
            type: 'default',
            components: [
              {
                type: 'default',
              },
              variableCmpDef,
            ],
          },
          collectionConfig: {
            collectionId: 'my_collection',
            startIndex: 0,
            endIndex: 2,
            dataSource: {
              type: DataVariableType,
              path: 'my_data_source_id',
            },
          },
        },
      };

      cmp = wrapper.components(collectionComponentDefinition)[0];
    });

    test('Serializion to JSON', () => {
      expect(cmp.toJSON()).toMatchSnapshot(`Collection with collection variable component ( no grandchildren )`);

      const firstChild = cmp.components().at(0);
      const newChildDefinition = {
        type: DataCollectionVariableType,
        variableType: DataCollectionStateVariableType.currentIndex,
        collectionId: 'my_collection',
        path: 'user',
      };
      firstChild.components().at(0).components(newChildDefinition);
      expect(cmp.toJSON()).toMatchSnapshot(`Collection with collection variable component ( with grandchildren )`);
    });

    test('Saving', () => {
      const projectData = editor.getProjectData();
      const page = projectData.pages[0];
      const frame = page.frames[0];
      const component = frame.component.components[0];

      expect(component).toMatchSnapshot(`Collection with collection variable component ( no grandchildren )`);

      const firstChild = cmp.components().at(0);
      const newChildDefinition = {
        type: DataCollectionVariableType,
        variableType: DataCollectionStateVariableType.currentIndex,
        collectionId: 'my_collection',
        path: 'user',
      };

      firstChild.components().at(0).components(newChildDefinition);
      expect(cmp.toJSON()).toMatchSnapshot(`Collection with collection variable component ( with grandchildren )`);
    });

    test('Loading', () => {
      const componentProjectData: ProjectData = {
        assets: [],
        pages: [
          {
            frames: [
              {
                component: {
                  components: [
                    {
                      collectionDef: {
                        componentDef: {
                          type: 'default',
                          components: [
                            {
                              type: DataCollectionVariableType,
                              variableType: DataCollectionStateVariableType.currentItem,
                              collectionId: 'my_collection',
                              path: 'user',
                            },
                          ],
                        },
                        collectionConfig: {
                          collectionId: 'my_collection',
                          dataSource: {
                            path: 'my_data_source_id',
                            type: DataVariableType,
                          },
                          endIndex: 1,
                          startIndex: 0,
                        },
                      },
                      type: DataCollectionType,
                    },
                  ],
                  docEl: {
                    tagName: 'html',
                  },
                  head: {
                    type: 'head',
                  },
                  stylable: [
                    'background',
                    'background-color',
                    'background-image',
                    'background-repeat',
                    'background-attachment',
                    'background-position',
                    'background-size',
                  ],
                  type: 'wrapper',
                },
                id: 'frameid',
              },
            ],
            id: 'pageid',
            type: 'main',
          },
        ],
        styles: [],
        symbols: [],
        dataSources: [dataSource],
      };
      editor.loadProjectData(componentProjectData);

      const components = editor.getComponents();
      const component = components.models[0];
      const firstChild = component.components().at(0);
      const firstGrandchild = firstChild.components().at(0);
      const secondChild = component.components().at(1);
      const secondGrandchild = secondChild.components().at(0);

      expect(firstGrandchild.getInnerHTML()).toBe('user1');
      expect(secondGrandchild.getInnerHTML()).toBe('user2');

      firstRecord.set('user', 'new_user1_value');
      expect(firstGrandchild.getInnerHTML()).toBe('new_user1_value');
      expect(secondGrandchild.getInnerHTML()).toBe('user2');

      secondRecord.set('user', 'new_user2_value');
      expect(firstGrandchild.getInnerHTML()).toBe('new_user1_value');
      expect(secondGrandchild.getInnerHTML()).toBe('new_user2_value');
    });
  });
});
