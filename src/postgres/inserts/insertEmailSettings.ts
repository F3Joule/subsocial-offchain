import { runQuery, isValidSignature, upsertNonce } from '../utils';
import { log } from '../postges-logger'
import { SessionCall, SetUpEmailArgs } from '../types/sessionKey';
import { updateNonce } from '../updates/updateNonce';
import { getExpiresOnDate } from '../../express-api/email/utils';
import { Periodicity } from '../../express-api/utils';
import { formatEmail } from '@subsocial/utils/email';
import { clearConfirmationForOldEmails } from '../updates/clearConfirmationDate';

export type RequireEmailSettingsParams = {
	account: string,
	email: string,
}

const addEmailSettingsQuery = `
  INSERT INTO df.email_settings (account, original_email, formatted_email, periodicity, send_feeds, send_notifs)
  VALUES(:account, :original_email, :formatted_email, :periodicity, :send_feeds, :send_notifs)
  ON CONFLICT (account) DO UPDATE
  SET original_email = :original_email,
	formatted_email = :formatted_email,
	periodicity = :periodicity,
	send_feeds = :send_feeds,
	send_notifs = :send_notifs
	RETURNING *`

export const addEmailSettings = async (sessionCall: SessionCall<SetUpEmailArgs>) => {
	const { account, signature, message } = sessionCall
	const { email, periodicity, send_feeds = false, send_notifs = false } = message.args

	const { nonce, rootAddress } = await upsertNonce(account, message)

	if (parseInt(nonce.toString()) === message.nonce) {
		const isValid = isValidSignature({ account, signature, message } as SessionCall<SetUpEmailArgs>)
		if (!isValid) {
			log.error("Signature is not valid: function setEmailSettings ")
			return
		}

		log.debug(`Signature verified`)
		try {
			await clearConfirmationForOldEmails(rootAddress, email)

			const formatted_email = formatEmail(email)
			const res = await runQuery(addEmailSettingsQuery, { account: rootAddress, original_email: email, formatted_email, periodicity, send_feeds, send_notifs })
			await updateNonce(account, message.nonce + 1)
			log.debug(`Insert email settings in database: ${rootAddress}`)
			return res.rows
		} catch (err) {
			log.error(`Failed to insert email settings for account: ${rootAddress}`, err.stack)
			throw err
		}
	}
}

type AddEmailWithConfirmCodeParams = RequireEmailSettingsParams & {
	confirmationCode: string,
	periodicity?: Periodicity
}

const addEmailWithConfirmCodeQuery = `
  INSERT INTO df.email_settings (account, original_email, formatted_email, periodicity, send_feeds, send_notifs, confirmation_code, expires_on)
  VALUES(:account, :original_email, :formatted_email, :periodicity, :send_feeds, :send_notifs, :confirmationCode, :expiresOn)
  ON CONFLICT (account) DO UPDATE
	SET original_email = :original_email,
	formatted_email = :formatted_email,
	confirmation_code = :confirmationCode,
	expires_on = :expiresOn`

export const addEmailWithConfirmCode = async ({ periodicity = 'Never', email, ...params }: AddEmailWithConfirmCodeParams) => {
	const expiresOn = getExpiresOnDate()
	const formatted_email = formatEmail(email)

	try {
		await runQuery(addEmailWithConfirmCodeQuery, {
			...params,
			original_email: email,
			formatted_email,
			periodicity,
			expiresOn,
			send_feeds: true, // TODO: maybe dont do hardcode
			send_notifs: true
		})
		log.debug(`Insert email settings in database: ${params.account}`)
	} catch (err) {
		log.error(`Failed to insert email settings for account: ${params.account}`, err.stack)
		throw err
	}
}