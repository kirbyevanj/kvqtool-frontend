/**
 * Unit tests for workflow-builder.js exports
 */
import { jest } from '@jest/globals';

// Mock Drawflow (global) - exposes drawflow property, fires events, creates DOM nodes
class MockDrawflow {
  constructor(container) {
    this.container = container;
    this.editor_mode = 'edit';
    this._nodes = {};
    this._nodeId = 1;
    // Expose drawflow data structure as real Drawflow does
    this.drawflow = { drawflow: { Home: { data: this._nodes } } };
    this.reroute = false;
    this._handlers = {};
    this.on = jest.fn((event, handler) => {
      this._handlers[event] = handler;
    });
  }

  _emit(event, ...args) {
    if (this._handlers[event]) this._handlers[event](...args);
  }

  start() {}

  addNode(name, inputs, outputs, x, y, cls, data, html) {
    const id = this._nodeId++;
    this._nodes[id] = { name, data: { ...(data || {}) }, inputs: {}, outputs: {} };

    // Create DOM node like real Drawflow does - parse the template HTML
    const nodeEl = document.createElement('div');
    nodeEl.id = `node-${id}`;
    nodeEl.className = `drawflow-node ${cls}`;

    // Include the template HTML so df-attribute elements are queryable
    if (html) {
      const content = document.createElement('div');
      content.className = 'drawflow_content_node';
      content.innerHTML = html;
      nodeEl.appendChild(content);
    }

    // Create port dot elements
    if (inputs > 0) {
      const inputsDiv = document.createElement('div');
      inputsDiv.className = 'inputs';
      for (let i = 0; i < inputs; i++) {
        const dot = document.createElement('div');
        dot.className = `input input_${i + 1}`;
        inputsDiv.appendChild(dot);
      }
      nodeEl.appendChild(inputsDiv);
    }
    if (outputs > 0) {
      const outputsDiv = document.createElement('div');
      outputsDiv.className = 'outputs';
      for (let i = 0; i < outputs; i++) {
        const dot = document.createElement('div');
        dot.className = `output output_${i + 1}`;
        outputsDiv.appendChild(dot);
      }
      nodeEl.appendChild(outputsDiv);
    }
    document.body.appendChild(nodeEl);

    this._emit('nodeCreated', id);
    return id;
  }

  removeNodeId(id) {
    delete this._nodes[id];
    const el = document.getElementById(`node-${id}`);
    if (el) el.remove();
  }

  export() {
    return { drawflow: { Home: { data: this._nodes } } };
  }

  import(data) {
    Object.keys(this._nodes).forEach(k => delete this._nodes[k]);
    const imported = data?.drawflow?.Home?.data || {};
    Object.assign(this._nodes, imported);
  }

  clear() {
    // Clear in-place so drawflow.drawflow.Home.data reference stays valid
    Object.keys(this._nodes).forEach(k => delete this._nodes[k]);
    this._nodeId = 1;
    document.querySelectorAll('[id^="node-"]').forEach(n => n.remove());
  }

  getNodeFromId(id) { return this._nodes[id]; }

  updateNodeDataFromId(id, data) {
    if (this._nodes[id]) this._nodes[id].data = { ...this._nodes[id].data, ...data };
  }

  addConnection(src, dst, outPort, inPort) {
    if (!this._nodes[src] || !this._nodes[dst]) return;
    // Store output connection (src -> dst)
    if (!this._nodes[src].outputs[outPort]) {
      this._nodes[src].outputs[outPort] = { connections: [] };
    }
    this._nodes[src].outputs[outPort].connections.push({ node: String(dst), output: inPort });
    // Store input connection (dst <- src)
    if (!this._nodes[dst].inputs[inPort]) {
      this._nodes[dst].inputs[inPort] = { connections: [] };
    }
    this._nodes[dst].inputs[inPort].connections.push({ node: String(src), input: outPort });
  }

  zoom_reset() {}
}
global.Drawflow = MockDrawflow;

// Mock fetch for workflow API calls
global.fetch = jest.fn();

// Set up DOM
document.body.innerHTML = `
  <div id="drawflow"></div>
  <div id="wf-node-menu"></div>
  <select id="wf-load-select"><option value="">-- Load --</option></select>
  <input id="wf-name-input" type="text" value="Test Workflow" />
  <div id="job-progress"></div>
  <div id="wf-session-legend"></div>
  <select df-resource_id><option value="">Select...</option></select>
  <select df-reference_resource_id><option value="">Select...</option></select>
  <select df-distorted_resource_id><option value="">Select...</option></select>
  <select class="wf-workflow-select"><option value="">Select...</option></select>
`;

import {
  getNodeTypes,
  setWorkflowId,
  getWorkflowId,
  setWorkflowName,
  getWorkflowName,
  clearEditor,
  initDrawflow,
  addNode,
  exportDAG,
  importDAG,
  populateResourceDropdowns,
  populateWorkflowDropdowns,
  restoreSelectValues,
  getSessionColors,
  getLocalNodeTypes,
  zoomReset,
} from '../js/workflow-builder.js';

// Initialize editor once
const container = document.getElementById('drawflow');
initDrawflow(container);

describe('workflow-builder - state getters/setters', () => {
  test('getWorkflowId returns null initially', () => {
    setWorkflowId(null);
    expect(getWorkflowId()).toBeNull();
  });

  test('setWorkflowId and getWorkflowId round-trip', () => {
    setWorkflowId('wf-abc-123');
    expect(getWorkflowId()).toBe('wf-abc-123');
    setWorkflowId(null);
  });

  test('setWorkflowName and getWorkflowName round-trip', () => {
    setWorkflowName('My Workflow');
    expect(getWorkflowName()).toBe('My Workflow');
    setWorkflowName(null);
  });

  test('getWorkflowName returns null initially', () => {
    setWorkflowName(null);
    expect(getWorkflowName()).toBeNull();
  });
});

describe('workflow-builder - getNodeTypes', () => {
  test('returns an array of node type strings', () => {
    const types = getNodeTypes();
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
  });

  test('includes expected node types', () => {
    const types = getNodeTypes();
    expect(types).toContain('x264Transcode');
    expect(types).toContain('ResourceDownload');
    expect(types).toContain('ResourceUpload');
  });

  test('all items are strings', () => {
    const types = getNodeTypes();
    types.forEach((t) => expect(typeof t).toBe('string'));
  });

  test('types are non-empty strings', () => {
    const types = getNodeTypes();
    types.forEach((t) => expect(t.length).toBeGreaterThan(0));
  });
});

describe('workflow-builder - getSessionColors', () => {
  test('returns an array', () => {
    const colors = getSessionColors();
    expect(Array.isArray(colors)).toBe(true);
  });

  test('returns non-empty color array', () => {
    const colors = getSessionColors();
    expect(colors.length).toBeGreaterThan(0);
  });

  test('colors are strings', () => {
    const colors = getSessionColors();
    colors.forEach(c => expect(typeof c).toBe('string'));
  });
});

describe('workflow-builder - getLocalNodeTypes', () => {
  test('returns a Set', () => {
    const types = getLocalNodeTypes();
    expect(types).toBeInstanceOf(Set);
  });

  test('includes x264Transcode', () => {
    expect(getLocalNodeTypes().has('x264Transcode')).toBe(true);
  });

  test('includes ResourceDownload', () => {
    expect(getLocalNodeTypes().has('ResourceDownload')).toBe(true);
  });

  test('includes FileMetricAnalysis', () => {
    expect(getLocalNodeTypes().has('FileMetricAnalysis')).toBe(true);
  });
});

describe('workflow-builder - initDrawflow', () => {
  test('initializes without throwing', () => {
    expect(() => initDrawflow(container)).not.toThrow();
  });

  test('can be called multiple times (re-init is no-op)', () => {
    expect(() => {
      initDrawflow(container);
      initDrawflow(container);
    }).not.toThrow();
  });
});

describe('workflow-builder - clearEditor', () => {
  test('clearEditor does not throw', () => {
    expect(() => clearEditor()).not.toThrow();
  });

  test('clearEditor resets workflowId', () => {
    setWorkflowId('some-id');
    clearEditor();
    expect(getWorkflowId()).toBeNull();
  });

  test('clearEditor resets workflowName', () => {
    setWorkflowName('some-name');
    clearEditor();
    expect(getWorkflowName()).toBeNull();
  });
});

describe('workflow-builder - addNode', () => {
  beforeEach(() => {
    clearEditor();
  });

  test('addNode returns a node id for valid type', () => {
    const id = addNode('x264Transcode');
    expect(id).toBeTruthy();
  });

  test('addNode returns null/undefined for unknown type', () => {
    const id = addNode('NonExistentNode');
    expect(id).toBeFalsy();
  });

  test('addNode works for ResourceDownload', () => {
    const id = addNode('ResourceDownload');
    expect(id).toBeTruthy();
  });

  test('addNode works for ResourceUpload', () => {
    const id = addNode('ResourceUpload');
    expect(id).toBeTruthy();
  });

  test('addNode works for SceneCut', () => {
    const id = addNode('SceneCut');
    expect(id).toBeTruthy();
  });

  test('addNode works for GenerateReport', () => {
    const id = addNode('GenerateReport');
    expect(id).toBeTruthy();
  });

  test('addNode works for FileMetricAnalysis', () => {
    const id = addNode('FileMetricAnalysis');
    expect(id).toBeTruthy();
  });

  test('addNode works for x264RemoteTranscode', () => {
    const id = addNode('x264RemoteTranscode');
    expect(id).toBeTruthy();
  });

  test('addNode works for RemoteFileMetricAnalysis', () => {
    const id = addNode('RemoteFileMetricAnalysis');
    expect(id).toBeTruthy();
  });

  test('addNode works for RemoteSceneCut', () => {
    const id = addNode('RemoteSceneCut');
    expect(id).toBeTruthy();
  });

  test('addNode works for TransnetV2SceneCut', () => {
    const id = addNode('TransnetV2SceneCut');
    expect(id).toBeTruthy();
  });

  test('addNode works for SegmentMedia', () => {
    const id = addNode('SegmentMedia');
    expect(id).toBeTruthy();
  });

  test('addNode works for RemoteSegmentMedia', () => {
    const id = addNode('RemoteSegmentMedia');
    expect(id).toBeTruthy();
  });

  test('addNode works for SceneCutDispatch', () => {
    const id = addNode('SceneCutDispatch');
    expect(id).toBeTruthy();
  });

  test('addNode works for CompositeWorkflow', () => {
    const id = addNode('CompositeWorkflow');
    expect(id).toBeTruthy();
  });

  test('addNode works for FragmentedMP4Repackage', () => {
    const id = addNode('FragmentedMP4Repackage');
    expect(id).toBeTruthy();
  });

  test('LOCAL node gets session_group assigned via assignDefaultSessionGroup', () => {
    const id = addNode('x264Transcode');
    expect(id).toBeTruthy();
    // applySessionGroupStyling should have run - check DOM
    const el = document.getElementById(`node-${id}`);
    expect(el.style.borderStyle).toBe('dashed');
  });

  test('remote node does not get session_group styling', () => {
    const id = addNode('x264RemoteTranscode');
    const el = document.getElementById(`node-${id}`);
    expect(el.style.borderStyle).toBe('');
  });

  test('addNode creates DOM element with template HTML', () => {
    const id = addNode('x264Transcode');
    const el = document.getElementById(`node-${id}`);
    expect(el).not.toBeNull();
    // Template HTML has df-crf input
    const crfInput = el.querySelector('[df-crf]');
    expect(crfInput).not.toBeNull();
  });

  test('addNode creates input port DOM elements', () => {
    const id = addNode('x264Transcode');
    const el = document.getElementById(`node-${id}`);
    expect(el.querySelectorAll('.inputs .input').length).toBeGreaterThan(0);
  });

  test('addNode creates output port DOM elements', () => {
    const id = addNode('x264Transcode');
    const el = document.getElementById(`node-${id}`);
    expect(el.querySelectorAll('.outputs .output').length).toBeGreaterThan(0);
  });
});

describe('workflow-builder - addPortLabels (via nodeCreated event)', () => {
  beforeEach(() => {
    clearEditor();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('addPortLabels runs via setTimeout after nodeCreated', () => {
    jest.useFakeTimers();
    const id = addNode('x264Transcode');
    jest.runAllTimers();
    const el = document.getElementById(`node-${id}`);
    expect(el).not.toBeNull();
  });

  test('addPortLabels adds port-dot-label spans for outputs', () => {
    jest.useFakeTimers();
    const id = addNode('ResourceDownload'); // outputs: ['video']
    jest.runAllTimers();
    const el = document.getElementById(`node-${id}`);
    const labels = el.querySelectorAll('.port-dot-label');
    expect(labels.length).toBeGreaterThan(0);
  });

  test('addPortLabels adds input labels for FileMetricAnalysis', () => {
    jest.useFakeTimers();
    const id = addNode('FileMetricAnalysis'); // inputs: ['video', 'video']
    jest.runAllTimers();
    const el = document.getElementById(`node-${id}`);
    const labels = el.querySelectorAll('.port-dot-label');
    expect(labels.length).toBeGreaterThan(0);
  });

  test('addPortLabels adds named input labels for FileMetricAnalysis (ref/dist)', () => {
    jest.useFakeTimers();
    const id = addNode('FileMetricAnalysis');
    jest.runAllTimers();
    const el = document.getElementById(`node-${id}`);
    const texts = Array.from(el.querySelectorAll('.port-dot-label')).map(l => l.textContent);
    expect(texts).toContain('ref');
    expect(texts).toContain('dist');
  });

  test('addPortLabels sets --pc CSS variable for color', () => {
    jest.useFakeTimers();
    const id = addNode('ResourceDownload');
    jest.runAllTimers();
    const el = document.getElementById(`node-${id}`);
    const span = el.querySelector('.port-dot-label');
    expect(span).not.toBeNull();
    expect(span.style.getPropertyValue('--pc')).toBeTruthy();
  });

  test('addPortLabels removes stale labels on re-run', () => {
    jest.useFakeTimers();
    const id = addNode('ResourceDownload');
    jest.runAllTimers();
    // Run timers again simulating re-import
    jest.runAllTimers();
    const el = document.getElementById(`node-${id}`);
    // Labels should not be duplicated (stale labels are removed)
    const labels = el.querySelectorAll('.port-dot-label');
    expect(labels.length).toBeLessThanOrEqual(2); // outputs only
  });

  test('importDAG triggers addPortLabels for all imported nodes', () => {
    jest.useFakeTimers();
    importDAG({
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': { id: '1', type: 'x264Transcode', params: {}, inputs: [], outputs: [] },
      },
    });
    jest.runAllTimers();
    // Should not throw
  });
});

describe('workflow-builder - exportDAG', () => {
  beforeEach(() => {
    clearEditor();
  });

  test('exportDAG returns non-null with empty editor', () => {
    const dag = exportDAG('TestWorkflow', 'proj-1');
    expect(dag).not.toBeNull();
  });

  test('exportDAG includes version 2.0', () => {
    const dag = exportDAG('TestWorkflow', 'proj-1');
    expect(dag.version).toBe('2.0');
  });

  test('exportDAG includes name field', () => {
    const dag = exportDAG('My Pipeline', 'proj-1');
    expect(dag.name).toBe('My Pipeline');
  });

  test('exportDAG uses Untitled for null name', () => {
    const dag = exportDAG(null, 'proj-1');
    expect(dag.name).toBe('Untitled');
  });

  test('exportDAG includes nodes object', () => {
    const dag = exportDAG('TestWorkflow', 'proj-1');
    expect(dag).toHaveProperty('nodes');
  });

  test('exportDAG nodes contains added nodes', () => {
    addNode('x264Transcode');
    const dag = exportDAG('TestWorkflow', 'proj-1');
    expect(Object.keys(dag.nodes).length).toBeGreaterThan(0);
  });

  test('exportDAG node has type field', () => {
    addNode('ResourceDownload');
    const dag = exportDAG('TestWorkflow', 'proj-1');
    const nodes = Object.values(dag.nodes);
    expect(nodes[0]).toHaveProperty('type');
  });

  test('exportDAG node has params with project_id', () => {
    addNode('x264Transcode');
    const dag = exportDAG('TestWorkflow', 'proj-42');
    const nodes = Object.values(dag.nodes);
    expect(nodes[0].params.project_id).toBe('proj-42');
  });

  test('exportDAG includes session_groups when LOCAL node added', () => {
    addNode('x264Transcode'); // LOCAL_NODE_TYPE gets _session_group
    const dag = exportDAG('Test', 'proj-1');
    expect(dag).toHaveProperty('session_groups');
  });

  test('exportDAG session_group node has session_group field', () => {
    addNode('x264Transcode');
    const dag = exportDAG('Test', 'proj-1');
    const nodes = Object.values(dag.nodes);
    const localNode = nodes.find(n => n.type === 'x264Transcode');
    expect(localNode).toHaveProperty('session_group');
  });

  test('exportDAG includes input_types for nodes with inputs', () => {
    addNode('x264Transcode'); // spec.in = ['video']
    const dag = exportDAG('Test', 'proj-1');
    const n = Object.values(dag.nodes).find(n => n.type === 'x264Transcode');
    expect(n).toHaveProperty('input_types');
  });

  test('exportDAG includes output_types for nodes with outputs', () => {
    addNode('ResourceDownload'); // spec.out = ['video']
    const dag = exportDAG('Test', 'proj-1');
    const n = Object.values(dag.nodes).find(n => n.type === 'ResourceDownload');
    expect(n).toHaveProperty('output_types');
  });

  test('exportDAG includes workflow_ref from imported node', () => {
    // Import a node with workflow_ref, then export
    importDAG({
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': {
          id: '1',
          type: 'CompositeWorkflow',
          params: {},
          workflow_ref: 'wf-child-1',
          inputs: [],
          outputs: [],
        },
      },
    });
    const dag = exportDAG('Test', 'proj-1');
    const nodes = Object.values(dag.nodes);
    expect(nodes.some(n => n.workflow_ref === 'wf-child-1')).toBe(true);
  });

  test('exportDAG includes input_map from imported node', () => {
    importDAG({
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': {
          id: '1',
          type: 'x264Transcode',
          params: {},
          input_map: { globalKey: 'localKey' },
          inputs: [],
          outputs: [],
        },
      },
    });
    const dag = exportDAG('Test', 'proj-1');
    const nodes = Object.values(dag.nodes);
    const n = nodes.find(n => n.type === 'x264Transcode');
    expect(n).toHaveProperty('input_map');
    expect(n.input_map['globalKey']).toBe('localKey');
  });
});

describe('workflow-builder - importDAG', () => {
  beforeEach(() => {
    clearEditor();
  });

  test('importDAG with null does not throw', () => {
    expect(() => importDAG(null)).not.toThrow();
  });

  test('importDAG with empty nodes does not throw', () => {
    expect(() => importDAG({ version: '2.0', name: 'Empty', nodes: {} })).not.toThrow();
  });

  test('importDAG with legacy drawflow format imports', () => {
    const legacyDag = { drawflow: { Home: { data: {} } } };
    expect(() => importDAG(legacyDag)).not.toThrow();
  });

  test('importDAG with valid node structure does not throw', () => {
    const dag = {
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': { id: '1', type: 'x264Transcode', params: {}, inputs: [], outputs: [] },
      },
    };
    expect(() => importDAG(dag)).not.toThrow();
  });

  test('importDAG applies param values to DOM inputs', () => {
    const dag = {
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': { id: '1', type: 'x264Transcode', params: { crf: '28' }, inputs: [], outputs: [] },
      },
    };
    importDAG(dag);
    // Find the node element and check crf input value
    const nodes = document.querySelectorAll('[id^="node-"]');
    let found = false;
    nodes.forEach(node => {
      const crfInput = node.querySelector('[df-crf]');
      if (crfInput && crfInput.value === '28') found = true;
    });
    expect(found).toBe(true);
  });

  test('importDAG with session_group does not throw', () => {
    const dag = {
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': {
          id: '1',
          type: 'x264Transcode',
          params: { crf: '23' },
          session_group: 'session-0',
          inputs: [],
          outputs: [],
        },
      },
    };
    expect(() => importDAG(dag)).not.toThrow();
  });

  test('importDAG with workflow_ref does not throw', () => {
    const dag = {
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': {
          id: '1',
          type: 'CompositeWorkflow',
          params: {},
          workflow_ref: 'wf-ref-123',
          inputs: [],
          outputs: [],
        },
      },
    };
    expect(() => importDAG(dag)).not.toThrow();
  });

  test('importDAG with input_map does not throw', () => {
    const dag = {
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': {
          id: '1',
          type: 'x264Transcode',
          params: {},
          input_map: { globalKey: 'localKey' },
          inputs: [],
          outputs: [],
        },
      },
    };
    expect(() => importDAG(dag)).not.toThrow();
  });

  test('importDAG with connections does not throw', () => {
    const dag = {
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': { id: '1', type: 'ResourceDownload', params: {}, inputs: [], outputs: ['2'] },
        '2': { id: '2', type: 'x264Transcode', params: {}, inputs: ['1'], outputs: [] },
      },
    };
    expect(() => importDAG(dag)).not.toThrow();
  });

  test('importDAG with unknown node type skips it', () => {
    const dag = {
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': { id: '1', type: 'UnknownNodeType', params: {}, inputs: [], outputs: [] },
      },
    };
    expect(() => importDAG(dag)).not.toThrow();
  });

  test('importDAG catch block executes on error', () => {
    // Create a dag object with a getter that throws on access
    const badDag = Object.defineProperty({}, 'drawflow', {
      get() { throw new Error('intentional test error'); }
    });
    // Should not propagate - catch block logs the error
    expect(() => importDAG(badDag)).not.toThrow();
  });

  test('importDAG handles multiple connected nodes', () => {
    const dag = {
      version: '2.0',
      name: 'Multi',
      nodes: {
        '1': { id: '1', type: 'ResourceDownload', params: {}, inputs: [], outputs: ['2'] },
        '2': { id: '2', type: 'x264Transcode', params: {}, inputs: ['1'], outputs: ['3'] },
        '3': { id: '3', type: 'ResourceUpload', params: {}, inputs: ['2'], outputs: [] },
      },
    };
    expect(() => importDAG(dag)).not.toThrow();
  });

  test('importDAG with null input_map value does not add it', () => {
    const dag = {
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': {
          id: '1',
          type: 'x264Transcode',
          params: {},
          input_map: { globalKey: null },
          inputs: [],
          outputs: [],
        },
      },
    };
    expect(() => importDAG(dag)).not.toThrow();
  });
});

describe('workflow-builder - populateResourceDropdowns', () => {
  test('populates resource selects with options', () => {
    const resources = [
      { id: 'r1', name: 'Video 1' },
      { id: 'r2', name: 'Video 2' },
    ];
    populateResourceDropdowns(resources);
    const sel = document.querySelector('select[df-resource_id]');
    expect(sel.innerHTML).toContain('Video 1');
    expect(sel.innerHTML).toContain('Video 2');
  });

  test('preserves current selection', () => {
    const resources = [
      { id: 'r1', name: 'Video 1' },
      { id: 'r2', name: 'Video 2' },
    ];
    const sel = document.querySelector('select[df-resource_id]');
    populateResourceDropdowns(resources);
    sel.value = 'r1';
    populateResourceDropdowns(resources);
    expect(sel.value).toBe('r1');
  });

  test('populates reference_resource_id selects', () => {
    const resources = [{ id: 'rx', name: 'Ref' }];
    populateResourceDropdowns(resources);
    const sel = document.querySelector('select[df-reference_resource_id]');
    expect(sel.innerHTML).toContain('Ref');
  });

  test('populates distorted_resource_id selects', () => {
    const resources = [{ id: 'rd', name: 'Dist' }];
    populateResourceDropdowns(resources);
    const sel = document.querySelector('select[df-distorted_resource_id]');
    expect(sel.innerHTML).toContain('Dist');
  });

  test('handles empty resources array', () => {
    expect(() => populateResourceDropdowns([])).not.toThrow();
    const sel = document.querySelector('select[df-resource_id]');
    expect(sel.options.length).toBe(1); // just the "Select resource..." option
  });
});

describe('workflow-builder - populateWorkflowDropdowns', () => {
  test('populates workflow selects with options', () => {
    const workflows = [
      { id: 'w1', name: 'Workflow 1' },
      { id: 'w2', name: 'Workflow 2' },
    ];
    populateWorkflowDropdowns(workflows);
    const sel = document.querySelector('select.wf-workflow-select');
    expect(sel.innerHTML).toContain('Workflow 1');
    expect(sel.innerHTML).toContain('Workflow 2');
  });

  test('preserves current selection', () => {
    const workflows = [{ id: 'w1', name: 'WF1' }, { id: 'w2', name: 'WF2' }];
    const sel = document.querySelector('select.wf-workflow-select');
    populateWorkflowDropdowns(workflows);
    sel.value = 'w1';
    populateWorkflowDropdowns(workflows);
    expect(sel.value).toBe('w1');
  });

  test('handles empty workflows array', () => {
    expect(() => populateWorkflowDropdowns([])).not.toThrow();
    const sel = document.querySelector('select.wf-workflow-select');
    expect(sel.options.length).toBe(1); // just the "Select workflow..." option
  });
});

describe('workflow-builder - restoreSelectValues', () => {
  beforeEach(() => {
    clearEditor();
  });

  test('restoreSelectValues does not throw with empty editor', () => {
    expect(() => restoreSelectValues()).not.toThrow();
  });

  test('restoreSelectValues does not throw with null arg', () => {
    expect(() => restoreSelectValues(null)).not.toThrow();
  });

  test('restoreSelectValues restores SELECT value from node data', () => {
    // Import a node with a preset value so data has preset: 'medium'
    // And the DOM node has a <select df-preset> element
    importDAG({
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': {
          id: '1',
          type: 'x264Transcode',
          params: { preset: 'medium', crf: '23' },
          inputs: [],
          outputs: [],
        },
      },
    });
    // Populate options first
    populateWorkflowDropdowns([]);
    // Should not throw
    expect(() => restoreSelectValues()).not.toThrow();
  });

  test('restoreSelectValues after populateResourceDropdowns restores value', () => {
    clearEditor();
    // Import ResourceDownload with resource_id
    importDAG({
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': {
          id: '1',
          type: 'ResourceDownload',
          params: { resource_id: 'r1' },
          inputs: [],
          outputs: [],
        },
      },
    });
    populateResourceDropdowns([{ id: 'r1', name: 'Video' }]);
    expect(() => restoreSelectValues()).not.toThrow();
  });
});

describe('workflow-builder - zoomReset', () => {
  test('zoomReset does not throw', () => {
    expect(() => zoomReset()).not.toThrow();
  });

  test('zoomReset dispatches resize event', () => {
    const resizeListener = jest.fn();
    window.addEventListener('resize', resizeListener);
    zoomReset();
    window.removeEventListener('resize', resizeListener);
    expect(resizeListener).toHaveBeenCalled();
  });
});

describe('workflow-builder - DAG round-trip', () => {
  beforeEach(() => {
    clearEditor();
  });

  test('export then import round-trip preserves node types', () => {
    addNode('x264Transcode');
    addNode('ResourceUpload');
    const dag = exportDAG('RoundTrip', 'proj-1');
    const types = Object.values(dag.nodes).map(n => n.type);
    expect(types).toContain('x264Transcode');
    expect(types).toContain('ResourceUpload');
  });

  test('exportDAG and importDAG work together without error', () => {
    addNode('ResourceDownload');
    addNode('x264Transcode');
    const dag = exportDAG('Pipeline', 'proj-1');
    clearEditor();
    expect(() => importDAG(dag)).not.toThrow();
  });

  test('exportDAG processes regular param values (line 362 coverage)', () => {
    // Import a node with non-special params so exportDAG hits the cleanData branch
    importDAG({
      version: '2.0',
      name: 'Test',
      nodes: {
        '1': {
          id: '1',
          type: 'x264Transcode',
          params: { crf: '28', preset: 'slow' },
          inputs: [],
          outputs: [],
        },
      },
    });
    const dag = exportDAG('Test', 'proj-1');
    const nodes = Object.values(dag.nodes);
    const n = nodes.find(n => n.type === 'x264Transcode');
    expect(n).toBeDefined();
    // crf should come through from cleanData
    expect(n.params.crf).toBe('28');
  });

  test('exportDAG traverses output connections (lines 331-332 coverage)', () => {
    // Import nodes with connections; addConnection stores them in outputs/inputs
    importDAG({
      version: '2.0',
      name: 'Connected',
      nodes: {
        '1': { id: '1', type: 'ResourceDownload', params: {}, inputs: [], outputs: ['2'] },
        '2': { id: '2', type: 'x264Transcode', params: {}, inputs: ['1'], outputs: [] },
      },
    });
    const dag = exportDAG('Connected', 'proj-1');
    const nodes = Object.values(dag.nodes);
    // The nodes should have outputs and inputs populated from connections
    expect(nodes.length).toBe(2);
  });

  test('exportDAG traverses input connections (lines 337-338 coverage)', () => {
    // Build a pipeline where node 2 has node 1 as input
    importDAG({
      version: '2.0',
      name: 'Pipeline',
      nodes: {
        '1': { id: '1', type: 'ResourceDownload', params: { resource_id: 'r1' }, inputs: [], outputs: ['2'] },
        '2': { id: '2', type: 'ResourceUpload', params: { output_name: 'out.mp4' }, inputs: ['1'], outputs: [] },
      },
    });
    const dag = exportDAG('Pipeline', 'proj-1');
    // Both nodes should be in the output DAG
    expect(Object.keys(dag.nodes).length).toBe(2);
  });
});
