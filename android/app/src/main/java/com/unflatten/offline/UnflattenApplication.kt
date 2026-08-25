package com.unflatten.offline

import android.app.Application

/**
 * No analytics/crash-reporting SDK is initialized here or anywhere in this
 * app (see PRIVACY.md). This class exists only because Android requires
 * an Application subclass to hang app-scoped state off; there is
 * currently no app-scoped state to hold, so it's intentionally minimal.
 */
class UnflattenApplication : Application()
