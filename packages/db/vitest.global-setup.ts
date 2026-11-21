import type { TestProject } from 'vitest/node'
import { setupTestDatabase } from './src/test-utils'

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string
  }
}

export default async function setup(project: TestProject) {
  project.provide('dbUrl', await setupTestDatabase('db'))
}
