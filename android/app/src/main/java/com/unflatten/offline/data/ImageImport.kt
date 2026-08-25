package com.unflatten.offline.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import kotlin.math.max

/**
 * Decodes an imported image respecting EXIF orientation (brief §31) and
 * downsampling to this build's working-resolution cap (DECISIONS.md #5:
 * 6000px long edge) without ever allocating a full-resolution intermediate
 * bitmap first -- BitmapFactory's inSampleSize does the downsampling
 * during decode itself.
 */
object ImageImport {
    private const val MAX_LONG_EDGE = 6000

    fun decode(context: Context, uri: Uri): Bitmap? {
        val resolver = context.contentResolver

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            ?: return null

        val longEdge = max(bounds.outWidth, bounds.outHeight)
        var sampleSize = 1
        while (longEdge / sampleSize > MAX_LONG_EDGE) sampleSize *= 2

        val decodeOpts = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888 // engine assumes 4-byte RGBA throughout
        }
        val decoded = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, decodeOpts) }
            ?: return null

        val orientation = resolver.openInputStream(uri)?.use { ExifInterface(it).getAttributeInt(
            ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL
        ) } ?: ExifInterface.ORIENTATION_NORMAL

        return applyExifOrientation(decoded, orientation)
    }

    private fun applyExifOrientation(bitmap: Bitmap, orientation: Int): Bitmap {
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
            ExifInterface.ORIENTATION_NORMAL, ExifInterface.ORIENTATION_UNDEFINED -> return bitmap
            else -> return bitmap
        }
        val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
        if (rotated !== bitmap) bitmap.recycle()
        return rotated.copy(Bitmap.Config.ARGB_8888, false)
    }
}
