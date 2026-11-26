import { describe, expect, it } from 'vitest'
import { TemporalMemoryStore } from '../../../dsh-plugin-desktop/node_modules/dsh-cognition-engine/lib/memory.js'
import { createTools } from '../../../dsh-plugin-desktop/node_modules/dsh-cognition-engine/lib/tools.js'

describe('cognition associative recall visibility', () => {
  it('keeps related expansion inside workspace and tag visibility', async () => {
    const memory = new TemporalMemoryStore({ now: () => 1_000_000 })
    memory.ingest({
      subject: 'PVA mechanism',
      content: 'PVA optics mechanism primary fact',
      tags: ['project:p1', 'domain:pva'],
      topicIds: ['topic-pva'],
      scope: 'workspace',
      workspaceId: 'workspace-a',
    })
    memory.ingest({
      subject: 'PVA mechanism',
      content: 'PVA optics mechanism related fact',
      tags: ['project:p1', 'domain:pva'],
      topicIds: ['topic-pva'],
      scope: 'workspace',
      workspaceId: 'workspace-a',
    })
    memory.ingest({
      subject: 'PVA mechanism',
      content: 'PVA optics mechanism other workspace leak',
      tags: ['project:p1', 'domain:pva'],
      topicIds: ['topic-pva'],
      scope: 'workspace',
      workspaceId: 'workspace-b',
    })
    memory.ingest({
      subject: 'PVA mechanism',
      content: 'PVA optics mechanism other domain leak',
      tags: ['project:p1', 'domain:waxs'],
      topicIds: ['topic-pva'],
      scope: 'workspace',
      workspaceId: 'workspace-a',
    })

    const recall = createTools({
      memory,
      topics: { get: () => undefined },
      config: {},
      touch: () => {},
      taskManager: {},
      proactive: {},
      reflection: {},
      tasksReady: Promise.resolve(),
    }).find(tool => tool.name === 'cognition_recall')
    if (recall === undefined) throw new Error('cognition_recall tool was not created')

    const result = JSON.parse(await recall.execute({
      query: 'PVA optics mechanism primary fact',
      mode: 'associative',
      limit: 1,
      scope: 'workspace',
      workspaceId: 'workspace-a',
      tags: ['project:p1', 'domain:pva'],
    }, { agent: { id: 'agent-1' } })) as { related?: string[]; hits: Array<{ content: string }> }

    expect(result.hits).toHaveLength(1)
    expect(result.related).toContain('PVA optics mechanism related fact')
    expect(result.related).not.toContain('PVA optics mechanism other workspace leak')
    expect(result.related).not.toContain('PVA optics mechanism other domain leak')
  })
})
