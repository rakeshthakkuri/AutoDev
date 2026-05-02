import { describe, it } from 'node:test';
import assert from 'node:assert';
import { checkPropInterfaces } from '../../src/services/propInterfaceCheck.js';

const APP = (children) => `
import React from 'react';
${children.imports || ''}
const App: React.FC = () => {
  ${children.body || ''}
  return (
    <div>
      ${children.jsx || ''}
    </div>
  );
};
export default App;
`;

describe('checkPropInterfaces', () => {
    it('passes a matching contract', () => {
        const files = {
            'src/App.tsx': APP({
                imports: "import Stats from './components/Stats';",
                jsx: '<Stats tasks={[]} />',
            }),
            'src/components/Stats.tsx': `
import React from 'react';
interface StatsProps { tasks: any[] }
const Stats: React.FC<StatsProps> = ({ tasks }) => <div>{tasks.length}</div>;
export default Stats;
`,
        };
        const { issues } = checkPropInterfaces(files);
        assert.strictEqual(issues.length, 0);
    });

    it('flags an EXTRA_PROP when parent passes a prop the child does not declare', () => {
        const files = {
            'src/App.tsx': APP({
                imports: "import Stats from './components/Stats';",
                jsx: '<Stats stats={{ total: 0 }} />',
            }),
            'src/components/Stats.tsx': `
import React from 'react';
interface StatsProps { tasks: any[] }
const Stats: React.FC<StatsProps> = ({ tasks }) => <div>{tasks.length}</div>;
export default Stats;
`,
        };
        const { issues } = checkPropInterfaces(files);
        const extras = issues.filter(i => i.subtype === 'EXTRA_PROP');
        assert.strictEqual(extras.length, 1);
        assert.strictEqual(extras[0].component, 'Stats');
        assert.strictEqual(extras[0].details.extraProp, 'stats');
        assert.strictEqual(extras[0].file, 'src/App.tsx');
    });

    it('flags a MISSING_REQUIRED prop when parent omits a required interface field', () => {
        const files = {
            'src/App.tsx': APP({
                imports: "import Stats from './components/Stats';",
                jsx: '<Stats />',
            }),
            'src/components/Stats.tsx': `
import React from 'react';
interface StatsProps { tasks: any[]; onAdd: () => void }
const Stats: React.FC<StatsProps> = ({ tasks, onAdd }) => <div>{tasks.length}</div>;
export default Stats;
`,
        };
        const { issues } = checkPropInterfaces(files);
        const missing = issues.filter(i => i.subtype === 'MISSING_REQUIRED');
        assert.strictEqual(missing.length, 2);
        const names = missing.map(m => m.details.missingProp).sort();
        assert.deepStrictEqual(names, ['onAdd', 'tasks']);
    });

    it('does NOT flag a MISSING_REQUIRED for an optional prop', () => {
        const files = {
            'src/App.tsx': APP({
                imports: "import Stats from './components/Stats';",
                jsx: '<Stats tasks={[]} />',
            }),
            'src/components/Stats.tsx': `
import React from 'react';
interface StatsProps { tasks: any[]; onAdd?: () => void }
const Stats: React.FC<StatsProps> = ({ tasks, onAdd }) => <div>{tasks.length}</div>;
export default Stats;
`,
        };
        const { issues } = checkPropInterfaces(files);
        assert.strictEqual(issues.length, 0);
    });

    it('emits NO_INTERFACE warning when child has no Props interface but parent passes props', () => {
        const files = {
            'src/App.tsx': APP({
                imports: "import Stats from './components/Stats';",
                jsx: '<Stats foo="bar" />',
            }),
            'src/components/Stats.tsx': `
import React from 'react';
const Stats: React.FC = () => <div>hello</div>;
export default Stats;
`,
        };
        const { issues } = checkPropInterfaces(files);
        const noInterface = issues.filter(i => i.subtype === 'NO_INTERFACE');
        assert.strictEqual(noInterface.length, 1);
        assert.strictEqual(noInterface[0].severity, 'warning');
    });

    it('reproduces the user-reported TaskStats/TaskList bug', () => {
        const files = {
            'src/App.tsx': `
import React, { useState } from 'react';
import TaskStats from './components/TaskStats';
import TaskList from './components/TaskList';

const App: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const stats = { total: 0, completed: 0, pending: 0 };
  return (
    <div>
      <TaskStats stats={stats} />
      <TaskList tasks={tasks} onToggle={() => {}} onDelete={() => {}} />
    </div>
  );
};
export default App;
`,
            'src/components/TaskStats.tsx': `
import React from 'react';
interface TaskStatsProps { tasks?: any[] }
const TaskStats: React.FC<TaskStatsProps> = ({ tasks = [] }) => <div>{tasks.length}</div>;
export default TaskStats;
`,
            'src/components/TaskList.tsx': `
import React from 'react';
interface TaskListProps { tasks?: any[]; onTasksChange?: (t: any[]) => void }
const TaskList: React.FC<TaskListProps> = ({ tasks = [] }) => <ul>{tasks.length}</ul>;
export default TaskList;
`,
        };
        const { issues } = checkPropInterfaces(files);
        const extras = issues.filter(i => i.subtype === 'EXTRA_PROP');
        const extraNames = extras.map(e => e.details.extraProp).sort();
        assert.deepStrictEqual(extraNames, ['onDelete', 'onToggle', 'stats']);
    });

    it('groups issues by parent file', () => {
        const files = {
            'src/App.tsx': APP({
                imports: "import Stats from './components/Stats';",
                jsx: '<Stats stats={{}} />',
            }),
            'src/components/Stats.tsx': `
import React from 'react';
interface StatsProps { tasks: any[] }
const Stats: React.FC<StatsProps> = ({ tasks }) => <div>{tasks.length}</div>;
export default Stats;
`,
        };
        const { byFile } = checkPropInterfaces(files);
        assert.ok(byFile['src/App.tsx']);
        assert.ok(byFile['src/App.tsx'].length >= 1);
    });

    it('handles import alias rename ("import Stats from \'./TaskStats\'")', () => {
        const files = {
            'src/App.tsx': `
import React from 'react';
import Stats from './components/TaskStats';

const App: React.FC = () => (
  <div>
    <Stats wrong={42} />
  </div>
);
export default App;
`,
            'src/components/TaskStats.tsx': `
import React from 'react';
interface TaskStatsProps { tasks: any[] }
const TaskStats: React.FC<TaskStatsProps> = ({ tasks }) => <div>{tasks.length}</div>;
export default TaskStats;
`,
        };
        const { issues } = checkPropInterfaces(files);
        // Note: the local import alias is "Stats" but the component's declared name is "TaskStats".
        // The check matches on the declared component name, so this scenario produces no JSX
        // call site for "TaskStats" (it's rendered as <Stats/>). That's a known limitation —
        // we'd need import-graph awareness to catch this. We at least don't crash.
        assert.ok(Array.isArray(issues));
    });

    it('does not crash on files that fail to parse', () => {
        const files = {
            'src/App.tsx': 'this is not valid TS code <<<<',
            'src/components/Stats.tsx': `
interface StatsProps { tasks: any[] }
const Stats: React.FC<StatsProps> = ({ tasks }) => <div>{tasks.length}</div>;
export default Stats;
`,
        };
        const { issues } = checkPropInterfaces(files);
        // Just shouldn't throw
        assert.ok(Array.isArray(issues));
    });

    it('ignores reserved React props (key, ref, children, className, style, id)', () => {
        const files = {
            'src/App.tsx': APP({
                imports: "import Stats from './components/Stats';",
                jsx: '<Stats tasks={[]} key="a" className="foo" id="bar" />',
            }),
            'src/components/Stats.tsx': `
import React from 'react';
interface StatsProps { tasks: any[] }
const Stats: React.FC<StatsProps> = ({ tasks }) => <div>{tasks.length}</div>;
export default Stats;
`,
        };
        const { issues } = checkPropInterfaces(files);
        assert.strictEqual(issues.length, 0);
    });
});
