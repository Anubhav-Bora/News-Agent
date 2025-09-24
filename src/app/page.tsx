// Landing/dashboard page
import AgentStatus from '@/components/AgentStatus';

export default function Home() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to News Agent
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Your AI-powered daily news assistant that automatically collects, summarizes, 
          and delivers personalized news content directly to your inbox.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        <div className="news-card">
          <div className="flex items-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full mr-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">Automated Collection</h2>
          </div>
          <p className="text-gray-600">
            Automatically fetches news from multiple trusted sources including BBC, CNN, Reuters, and more.
          </p>
        </div>

        <div className="news-card">
          <div className="flex items-center mb-4">
            <div className="bg-green-100 p-3 rounded-full mr-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014.846 21H9.154a3.374 3.374 0 00-2.872-1.453l-.548-.547z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">AI Summarization</h2>
          </div>
          <p className="text-gray-600">
            Uses Google Gemini AI to create concise, intelligent summaries of the day's most important news.
          </p>
        </div>

        <div className="news-card">
          <div className="flex items-center mb-4">
            <div className="bg-purple-100 p-3 rounded-full mr-4">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 14.142M8.464 15.536a5 5 0 01-7.072 0M6.636 6.636a9 9 0 00-12.728 0" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">Audio & PDF</h2>
          </div>
          <p className="text-gray-600">
            Generates both PDF documents and audio versions of your news summaries for convenient consumption.
          </p>
        </div>

        <div className="news-card">
          <div className="flex items-center mb-4">
            <div className="bg-orange-100 p-3 rounded-full mr-4">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">Email Delivery</h2>
          </div>
          <p className="text-gray-600">
            Automatically delivers your personalized news digest to your inbox every morning.
          </p>
        </div>
      </div>

      <div className="mb-8">
        <AgentStatus />
      </div>

      <div className="text-center">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-2">Scheduled Daily Updates</h3>
          <p className="text-gray-600 mb-4">
            Your news pipeline runs automatically every day at 8:00 AM UTC via GitHub Actions.
          </p>
          <a
            href="/api/run-pipeline"
            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1m3-13v1m2 12v1M3 21v-1m18 0v-1M3 12h1M21 12h1M3 6h1M21 6h1" />
            </svg>
            Run Pipeline Now
          </a>
        </div>
      </div>
    </div>
  );
}
