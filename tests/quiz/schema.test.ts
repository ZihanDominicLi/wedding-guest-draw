import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const readSchema = () => readFile(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8')

describe('quiz persistence schema contract', () => {
  it('defines the quiz session lifecycle and question cardinality fields', async () => {
    const schema = await readSchema()

    expect(schema).toContain('enum QuizSessionStatus')
    expect(schema).toContain('DRAFT')
    expect(schema).toContain('READY')
    expect(schema).toContain('LIVE')
    expect(schema).toContain('REVIEW')
    expect(schema).toContain('FINISHED')
    expect(schema).toContain('CANCELLED')
    expect(schema).toMatch(/model QuizQuestion[\s\S]*@@unique\(\[sessionId, order\]\)/)
    expect(schema).toMatch(/model QuizAnswer[\s\S]*@@unique\(\[participantId, questionId\]\)/)
  })

  it('stores bounded guest scores and score-aware draw configuration', async () => {
    const schema = await readSchema()

    expect(schema).toMatch(/quizScore\s+Int\?/) 
    expect(schema).toContain('quizCompletedAt')
    expect(schema).toContain('quizSessionId')
    expect(schema).toContain('scoreThreshold')
    expect(schema).toContain('scoreFallbackStep')
    expect(schema).toContain('actualScoreThreshold')
    expect(schema).toContain('scoreFallbackCount')
  })
})
