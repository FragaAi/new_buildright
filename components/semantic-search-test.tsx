'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SearchResult {
  id: string
  pageId: string
  contentType: 'textual' | 'visual' | 'combined'
  chunkDescription: string
  similarity: number
  metadata: any
  boundingBox?: any
}

export function SemanticSearchTest({ chatId }: { chatId?: string }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const testQueries = [
    'find dimensions',
    'locate kitchen',
    'structural symbols',
    'building measurements',
    'architectural drawings',
    'door specifications',
    'window details',
    'structural elements'
  ]

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return

    setLoading(true)
    setError('')
    
    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: searchQuery,
          chatId,
          limit: 10,
        }),
      })

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`)
      }

      const data = await response.json()
      setResults(data.results || [])
      
      console.log('🔍 Search Results:', data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
      console.error('Search error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>🧠 Phase 1: Semantic Search Test</CardTitle>
          <CardDescription>
            Test real vector embeddings for architectural documents
            {chatId && ` (Chat: ${chatId})`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter search query (e.g., 'find dimensions', 'locate kitchen')"
              onKeyPress={(e) => e.key === 'Enter' && handleSearch(query)}
              className="flex-1"
            />
            <Button
              onClick={() => handleSearch(query)}
              disabled={loading || !query.trim()}
            >
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {/* Quick Test Buttons */}
          <div className="flex flex-wrap gap-2">
            {testQueries.map((testQuery) => (
              <Button
                key={testQuery}
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery(testQuery)
                  handleSearch(testQuery)
                }}
                disabled={loading}
              >
                {testQuery}
              </Button>
            ))}
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
              ❌ {error}
            </div>
          )}

          {/* Results Display */}
          {results.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">
                🎯 Found {results.length} matches
              </h3>
              
              {results.map((result, index) => (
                <Card key={result.id} className="border-l-4 border-l-blue-500">
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-600">
                          #{index + 1} • {result.contentType.toUpperCase()}
                        </span>
                        <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                          {(result.similarity * 100).toFixed(1)}% match
                        </span>
                      </div>
                      
                      <p className="text-gray-800">{result.chunkDescription}</p>
                      
                      {result.boundingBox && (
                        <div className="text-xs text-gray-500">
                          📍 Location: ({result.boundingBox.x}, {result.boundingBox.y}) 
                          {result.boundingBox.width}×{result.boundingBox.height}
                        </div>
                      )}
                      
                      {result.metadata && (
                        <details className="text-xs text-gray-500">
                          <summary className="cursor-pointer">View metadata</summary>
                          <pre className="mt-1 bg-gray-50 p-2 rounded text-xs overflow-auto">
                            {JSON.stringify(
                              typeof result.metadata === 'string' 
                                ? JSON.parse(result.metadata) 
                                : result.metadata, 
                              null, 
                              2
                            )}
                          </pre>
                        </details>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {loading && (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <p className="mt-2 text-gray-600">Generating embeddings and searching...</p>
            </div>
          )}

          {!loading && results.length === 0 && query && !error && (
            <div className="text-center py-8 text-gray-500">
              No matches found. Try uploading a PDF first or try different search terms.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 