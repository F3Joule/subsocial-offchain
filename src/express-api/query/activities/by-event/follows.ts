import { GetActivityFn, GetCountFn } from '../../types'
import { getActivitiesByEvent, getActivitiesCountByEvent, EventsName } from './common'

const followEvents: EventsName[] = [ 'SpaceFollowed', 'AccountFollowed' ]

export const getFollowActivitiesData: GetActivityFn = (params) =>
  getActivitiesByEvent({ ...params, events: followEvents })

export const getFollowActivitiesCount: GetCountFn = (account) =>
  getActivitiesCountByEvent({ account, events: followEvents })