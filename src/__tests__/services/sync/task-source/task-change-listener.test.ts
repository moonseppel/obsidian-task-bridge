import { TFile, TFolder } from 'obsidian';
import { TaskChangeListener, TaskChangeListenerSettings } from '../../../../services/sync/task-source/task-change-listener';

const BASE_SETTINGS: TaskChangeListenerSettings = {
  relativeTaskSourcePath: '',
  syncWholeVault: false,
  ignoreFilePatterns: '',
};

function tfile(path: string): TFile {
  const file = new TFile();
  file.path = path;
  file.name = path.split('/').pop() ?? path;
  file.extension = 'md';
  return file;
}

function tfolder(path: string): TFolder {
  const folder = new TFolder();
  folder.path = path;
  return folder;
}

interface Callbacks {
  onLocationRenamed: jest.Mock;
  onLocationDeleted: jest.Mock;
  onRelevantChange: jest.Mock;
}

interface ListenerContext {
  listener: TaskChangeListener;
  calls: Callbacks;
}

function listenerWith(settings: Partial<TaskChangeListenerSettings>): ListenerContext {
  const calls: Callbacks = {
    onLocationRenamed: jest.fn(),
    onLocationDeleted: jest.fn(),
    onRelevantChange: jest.fn(),
  };
  const listener = new TaskChangeListener(() => ({ ...BASE_SETTINGS, ...settings }), calls);
  return { listener, calls };
}

describe('TaskChangeListener single-note mode', () => {
  it('reacts to a modify of the configured note', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Tasks.md' });
    listener.handleModify(tfile('Tasks.md'));
    expect(calls.onRelevantChange).toHaveBeenCalledTimes(1);
  });

  it('ignores a modify of an unrelated note', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Tasks.md' });
    listener.handleModify(tfile('Other.md'));
    expect(calls.onRelevantChange).not.toHaveBeenCalled();
  });

  it('follows a rename of the configured note', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Tasks.md' });
    listener.handleRename(tfile('archive/Tasks.md'), 'Tasks.md');
    expect(calls.onLocationRenamed).toHaveBeenCalledWith('archive/Tasks.md', 'Tasks.md');
  });

  it('follows a rename of the configured folder', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Projects' });
    listener.handleRename(tfolder('Work'), 'Projects');
    expect(calls.onLocationRenamed).toHaveBeenCalledWith('Work', 'Projects');
  });

  it('treats a rename into local trash as a deletion', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Tasks.md' });
    listener.handleRename(tfile('.trash/Tasks.md'), 'Tasks.md');
    expect(calls.onLocationDeleted).toHaveBeenCalledTimes(1);
    expect(calls.onLocationRenamed).not.toHaveBeenCalled();
  });

  it('ignores a rename of an unrelated note', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Tasks.md' });
    listener.handleRename(tfile('archive/Other.md'), 'Other.md');
    expect(calls.onLocationRenamed).not.toHaveBeenCalled();
    expect(calls.onRelevantChange).not.toHaveBeenCalled();
  });

  it('clears the location on delete of the configured note', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Tasks.md' });
    listener.handleDelete(tfile('Tasks.md'));
    expect(calls.onLocationDeleted).toHaveBeenCalledTimes(1);
  });

  it('ignores delete of an unrelated note', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Tasks.md' });
    listener.handleDelete(tfile('Other.md'));
    expect(calls.onLocationDeleted).not.toHaveBeenCalled();
  });

  it('is always relevant for the configured note, even if it matches the ignore pattern', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Tasks.md', ignoreFilePatterns: 'Tasks.md' });
    listener.handleModify(tfile('Tasks.md'));
    expect(calls.onRelevantChange).toHaveBeenCalledTimes(1);
  });

  it('reacts to nothing when no location is configured', () => {
    const { listener, calls } = listenerWith({});
    listener.handleModify(tfile('Tasks.md'));
    expect(calls.onRelevantChange).not.toHaveBeenCalled();
  });
});

describe('TaskChangeListener folder mode', () => {
  it('reacts to a modify of a note under the configured folder', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Projects' });
    listener.handleModify(tfile('Projects/nested/Tasks.md'));
    expect(calls.onRelevantChange).toHaveBeenCalledTimes(1);
  });

  it('reacts to a create under the configured folder', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Projects' });
    listener.handleCreate(tfile('Projects/New.md'));
    expect(calls.onRelevantChange).toHaveBeenCalledTimes(1);
  });

  it('ignores a note outside the configured folder', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Projects' });
    listener.handleModify(tfile('Other/Tasks.md'));
    expect(calls.onRelevantChange).not.toHaveBeenCalled();
  });

  it('excludes a file under the folder matching the ignore pattern', () => {
    const { listener, calls } = listenerWith({
      relativeTaskSourcePath: 'Projects',
      ignoreFilePatterns: '*.sync-conflict.md',
    });
    listener.handleModify(tfile('Projects/Tasks.sync-conflict.md'));
    expect(calls.onRelevantChange).not.toHaveBeenCalled();
  });
});

describe('TaskChangeListener whole-vault mode', () => {
  it('reacts to any markdown file', () => {
    const { listener, calls } = listenerWith({ syncWholeVault: true });
    listener.handleModify(tfile('Anywhere/Tasks.md'));
    expect(calls.onRelevantChange).toHaveBeenCalledTimes(1);
  });

  it('excludes a file matching the ignore pattern', () => {
    const { listener, calls } = listenerWith({ syncWholeVault: true, ignoreFilePatterns: '*.sync-conflict.md' });
    listener.handleModify(tfile('Tasks.sync-conflict.md'));
    expect(calls.onRelevantChange).not.toHaveBeenCalled();
  });

  it('ignores the location setting for renames, since it is inert while whole-vault is on', () => {
    const { listener, calls } = listenerWith({ syncWholeVault: true, relativeTaskSourcePath: 'Tasks.md' });
    listener.handleRename(tfile('archive/Tasks.md'), 'Tasks.md');
    expect(calls.onLocationRenamed).not.toHaveBeenCalled();
    expect(calls.onRelevantChange).toHaveBeenCalledTimes(1);
  });
});

describe('TaskChangeListener non-markdown files', () => {
  it('ignores a non-markdown file even in whole-vault mode', () => {
    const { listener, calls } = listenerWith({ syncWholeVault: true });
    const file = tfile('image.png');
    file.extension = 'png';
    listener.handleModify(file);
    expect(calls.onRelevantChange).not.toHaveBeenCalled();
  });

  it('ignores a folder event that is not the configured location', () => {
    const { listener, calls } = listenerWith({ relativeTaskSourcePath: 'Projects' });
    listener.handleCreate(tfolder('Projects/Nested'));
    expect(calls.onRelevantChange).not.toHaveBeenCalled();
  });
});
