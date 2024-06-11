import * as core from '@actions/core'
import * as os from 'os'
import * as altool from './altool'
import {retry} from 'ts-retry-promise'
import {ExecOptions} from '@actions/exec/lib/interfaces'

async function run(): Promise<void> {
  try {
    if (os.platform() !== 'darwin') {
      throw new Error('Action requires macOS agent.')
    }

    const issuerId: string = core.getInput('issuer-id')
    const apiKeyId: string = core.getInput('api-key-id')
    const apiPrivateKey: string = core.getInput('api-private-key')
    const appPath: string = core.getInput('app-path')
    const appType: string = core.getInput('app-type')
    const retryAttempts: number = parseInt(
      core.getInput('retry-attempts-on-timeout')
    )

    let output = ''
    const options: ExecOptions = {}
    options.listeners = {
      stdout: (data: Buffer) => {
        output += data.toString()
      }
    }

    await altool.installPrivateKey(apiKeyId, apiPrivateKey)

    const uploadWithRetry = async (): Promise<void> => {
      await altool.uploadApp(appPath, appType, apiKeyId, issuerId, options)
      if (output.includes('timeout')) {
        throw new Error('timeout')
      }
    }

    const attemptUpload = async (): Promise<void> => {
      try {
        await uploadWithRetry()
      } catch (error) {
        if (error.message === 'timeout') {
          throw error
        } else {
          core.setFailed(`Upload failed: ${error.message}`)
          return
        }
      }
    }

    try {
      await retry(attemptUpload, {retries: retryAttempts, delay: 2000})
    } catch (error) {
      core.setFailed(
        `Upload failed after ${retryAttempts} attempts: ${error.message}`
      )
      return
    }

    await altool.deleteAllPrivateKeys()

    core.setOutput('altool-response', output)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
