import {
  addChildNotice,
  childNoticesIn,
  removeChildNotice,
  withChildNotices,
  withoutChildNotices,
} from '../../../services/todoist/child-notice';

const NOTICE =
  'TaskBridge tried to add a child to this task, but that is not supported by Todoist once the parent is ' +
  'completed. Reopening will allow the child to be synced in the next run. Child task title: Buy milk';

describe('addChildNotice', () => {
  it('appends the notice to an empty description', () => {
    expect(addChildNotice('', 'Buy milk')).toBe(NOTICE);
  });

  it('appends the notice below the user\'s text and the footer', () => {
    expect(addChildNotice('Notes\n\nTaskBridge ID: ^tb-a1', 'Buy milk')).toBe(
      `Notes\n\nTaskBridge ID: ^tb-a1\n${NOTICE}`,
    );
  });

  it('does not add the same notice twice', () => {
    const once = addChildNotice('', 'Buy milk');
    expect(addChildNotice(once, 'Buy milk')).toBe(once);
  });

  it('adds a separate line for a different child', () => {
    const first = addChildNotice('', 'Buy milk');
    const second = addChildNotice(first, 'Walk the dog');

    expect(second.split('\n')).toHaveLength(2);
  });
});

describe('removeChildNotice', () => {
  it('removes only the named notice, leaving the user\'s text and the footer untouched', () => {
    const description = `Notes\n\nTaskBridge ID: ^tb-a1\n${NOTICE}`;

    expect(removeChildNotice(description, 'Buy milk')).toBe('Notes\n\nTaskBridge ID: ^tb-a1');
  });

  it('leaves other notices alone', () => {
    const description = addChildNotice(addChildNotice('', 'Buy milk'), 'Walk the dog');

    expect(removeChildNotice(description, 'Buy milk')).toBe(
      'TaskBridge tried to add a child to this task, but that is not supported by Todoist once the parent is ' +
        'completed. Reopening will allow the child to be synced in the next run. Child task title: Walk the dog',
    );
  });

  it('is a no-op when the notice is not present', () => {
    expect(removeChildNotice('Notes', 'Buy milk')).toBe('Notes');
  });
});

describe('childNoticesIn', () => {
  it('lists every notice line', () => {
    const description = addChildNotice(addChildNotice('Notes', 'Buy milk'), 'Walk the dog');

    expect(childNoticesIn(description)).toHaveLength(2);
  });

  it('is empty without any notice', () => {
    expect(childNoticesIn('Notes\n\nTaskBridge ID: ^tb-a1')).toEqual([]);
  });
});

describe('withoutChildNotices', () => {
  it('strips every notice line, keeping the user\'s text and the footer', () => {
    const description = `Notes\n\nTaskBridge ID: ^tb-a1\n${NOTICE}`;

    expect(withoutChildNotices(description)).toBe('Notes\n\nTaskBridge ID: ^tb-a1');
  });

  it('leaves a description with no notice untouched', () => {
    expect(withoutChildNotices('Notes\n\nTaskBridge ID: ^tb-a1')).toBe('Notes\n\nTaskBridge ID: ^tb-a1');
  });
});

describe('withChildNotices', () => {
  it('reattaches notices below a freshly pushed description', () => {
    expect(withChildNotices('Notes\n\nTaskBridge ID: ^tb-a1', [NOTICE])).toBe(
      `Notes\n\nTaskBridge ID: ^tb-a1\n${NOTICE}`,
    );
  });

  it('is the description unchanged without any notice to reattach', () => {
    expect(withChildNotices('Notes\n\nTaskBridge ID: ^tb-a1', [])).toBe('Notes\n\nTaskBridge ID: ^tb-a1');
  });
});
