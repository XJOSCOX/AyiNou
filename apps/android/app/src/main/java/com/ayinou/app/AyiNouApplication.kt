package com.ayinou.app

import android.app.Application
import android.content.Context
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.memory.MemoryCache
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class AyiNouApplication : Application(), SingletonImageLoader.Factory {
    override fun newImageLoader(context: Context): ImageLoader = ImageLoader.Builder(context)
        .memoryCache { MemoryCache.Builder().maxSizePercent(context, 0.12).build() }
        .diskCache(null)
        .build()
}
