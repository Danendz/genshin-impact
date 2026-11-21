import { setupTestDatabase } from '@gi/db/test-utils'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string
  }
}

export default async function setup(project: TestProject) {
  project.provide('dbUrl', await setupTestDatabase('api'))
}
