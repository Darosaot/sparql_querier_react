// src/components/EnhancedSparqlEditor.js
import React, { useState, useRef } from 'react';
import { Form, Button, Card, Alert, Row, Col, Tooltip, OverlayTrigger } from 'react-bootstrap';
import queryTemplates from '../data/queryTemplates';

// Function to validate basic SPARQL syntax
const validateSparqlQuery = (query) => {
  if (!query || query.trim() === '') {
    return { valid: false, error: 'Query cannot be empty' };
  }

  const warnings = [];
  const upperQuery = query.toUpperCase();
  
  // Check query type and required clauses
  if (upperQuery.includes('SELECT')) {
    if (!upperQuery.includes('WHERE')) {
      return { valid: false, error: 'SELECT query must include a WHERE clause' };
    }
  } else if (upperQuery.includes('CONSTRUCT')) {
    if (!upperQuery.includes('WHERE')) {
      return { valid: false, error: 'CONSTRUCT query must include a WHERE clause' };
    }
  } else if (upperQuery.includes('ASK')) {
    if (!upperQuery.includes('WHERE')) {
      return { valid: false, error: 'ASK query must include a WHERE clause' };
    }
  } else if (upperQuery.includes('DESCRIBE')) {
    // DESCRIBE can be used without WHERE but it's less common
    if (!upperQuery.includes('WHERE')) {
      warnings.push('DESCRIBE query without WHERE clause might return large amounts of data');
    }
  } else {
    return { valid: false, error: 'Query must start with SELECT, CONSTRUCT, ASK, or DESCRIBE' };
  }
  
  // Check for balanced braces
  const openBraces = (query.match(/\{/g) || []).length;
  const closeBraces = (query.match(/\}/g) || []).length;
  
  if (openBraces !== closeBraces) {
    return { 
      valid: false, 
      error: `Unbalanced braces: ${openBraces} opening and ${closeBraces} closing braces` 
    };
  }
  
  // Check for unclosed quotes
  const doubleQuotes = (query.match(/"/g) || []).length;
  if (doubleQuotes % 2 !== 0) {
    return { valid: false, error: 'Unclosed double quotes in query' };
  }
  
  const singleQuotes = (query.match(/'/g) || []).length;
  if (singleQuotes % 2 !== 0) {
    return { valid: false, error: 'Unclosed single quotes in query' };
  }
  
  // Check for performance warnings
  if (!upperQuery.includes('LIMIT')) {
    warnings.push('Query does not have a LIMIT clause, which might return large result sets');
  }
  
  return { valid: true, warnings };
};

// Function to format SPARQL query (basic formatting)
const formatSparqlQuery = (query) => {
  if (!query) return '';
  
  let formatted = query;
  
  // Ensure consistent spacing for keywords
  const keywords = [
    'PREFIX', 'SELECT', 'DISTINCT', 'CONSTRUCT', 'ASK', 'DESCRIBE', 
    'FROM', 'WHERE', 'FILTER', 'OPTIONAL', 'UNION', 'MINUS', 'GRAPH', 
    'SERVICE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'OFFSET'
  ];
  
  // Ensure line breaks before major keywords
  keywords.forEach(keyword => {
    const regex = new RegExp(`(?<!(PREFIX|[a-z0-9_]))${keyword}\\b`, 'gi');
    formatted = formatted.replace(regex, `\n${keyword}`);
  });
  
  // Handle indentation
  const lines = formatted.split('\n');
  let indentLevel = 0;
  const formattedLines = [];
  
  lines.forEach(line => {
    let trimmedLine = line.trim();
    if (!trimmedLine) {
      formattedLines.push('');
      return;
    }
    
    // Decrease indent for closing brace
    if (trimmedLine.includes('}')) {
      indentLevel = Math.max(0, indentLevel - 1);
    }
    
    // Add appropriate indentation
    formattedLines.push('  '.repeat(indentLevel) + trimmedLine);
    
    // Increase indent for opening brace
    if (trimmedLine.includes('{')) {
      indentLevel++;
    }
  });
  
  return formattedLines.join('\n');
};

// List of common SPARQL prefixes with tooltips
const commonPrefixes = [
  { prefix: 'rdf', uri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', description: 'RDF basic vocabulary' },
  { prefix: 'rdfs', uri: 'http://www.w3.org/2000/01/rdf-schema#', description: 'RDF Schema vocabulary' },
  { prefix: 'owl', uri: 'http://www.w3.org/2002/07/owl#', description: 'Web Ontology Language' },
  { prefix: 'xsd', uri: 'http://www.w3.org/2001/XMLSchema#', description: 'XML Schema Datatypes' },
  { prefix: 'foaf', uri: 'http://xmlns.com/foaf/0.1/', description: 'Friend of a Friend vocabulary' },
  { prefix: 'dc', uri: 'http://purl.org/dc/elements/1.1/', description: 'Dublin Core elements' },
  { prefix: 'dct', uri: 'http://purl.org/dc/terms/', description: 'Dublin Core terms' },
  { prefix: 'skos', uri: 'http://www.w3.org/2004/02/skos/core#', description: 'Simple Knowledge Organization System' },
  { prefix: 'epo', uri: 'http://data.europa.eu/a4g/ontology#', description: 'EU Procurement Ontology' }
];

// Common endpoint suggestions
const endpointSuggestions = [
  { url: 'https://dbpedia.org/sparql', description: 'DBpedia - General knowledge from Wikipedia' },
  { url: 'https://query.wikidata.org/sparql', description: 'Wikidata - Structured data from Wikimedia projects' },
  { url: 'https://data.europa.eu/a4g/sparql', description: 'EU TED Data - Public procurement notices' },
  { url: 'http://linkedgeodata.org/sparql', description: 'LinkedGeoData - Spatial data from OpenStreetMap' }
];

// Line number helper function
const LineNumbers = ({ lines }) => {
  return (
    <div className="line-numbers">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="line-number">{i + 1}</div>
      ))}
    </div>
  );
};

const EnhancedSparqlEditor = ({ 
  sparqlEndpoint, 
  setSparqlEndpoint, 
  query, 
  setQuery, 
  onExecute, 
  isLoading 
}) => {
  const [validationResult, setValidationResult] = useState({ valid: true, warnings: [] });
  const [lineCount, setLineCount] = useState(1);
  const textareaRef = useRef(null);
  
  // Handle query change
  const handleQueryChange = (e) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    
    // Update line count for line numbers
    setLineCount((newQuery.match(/\n/g) || []).length + 1);
    
    // Simple validation for immediate feedback
    if (newQuery.length > 10) {
      const result = validateSparqlQuery(newQuery);
      setValidationResult(result);
    }
  };

  // Handle template selection
  const handleTemplateChange = (e) => {
    const selectedTemplate = e.target.value;
    const templateQuery = queryTemplates[selectedTemplate] || '';
    setQuery(templateQuery);
    
    // Update line count
    setLineCount((templateQuery.match(/\n/g) || []).length + 1);
    
    // Validate the selected template
    if (templateQuery) {
      const result = validateSparqlQuery(templateQuery);
      setValidationResult(result);
    }
  };

  // Handle execution with validation
  const handleExecuteQuery = () => {
    if (!sparqlEndpoint) {
      setValidationResult({ valid: false, error: 'Please provide a SPARQL endpoint URL' });
      return;
    }
    
    const result = validateSparqlQuery(query);
    setValidationResult(result);
    
    if (result.valid) {
      onExecute();
    }
  };

  // Add common prefix to query
  const addPrefix = (prefix, uri) => {
    // Check if the prefix is already in the query
    if (!query.includes(`PREFIX ${prefix}:`)) {
      const prefixDeclaration = `PREFIX ${prefix}: <${uri}>\n`;
      
      // Add at the beginning or after other prefixes
      const lines = query.split('\n');
      let lastPrefixIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().toUpperCase().startsWith('PREFIX')) {
          lastPrefixIndex = i;
        }
      }
      
      if (lastPrefixIndex >= 0) {
        // Insert after the last prefix
        lines.splice(lastPrefixIndex + 1, 0, prefixDeclaration);
      } else {
        // Insert at the beginning
        lines.unshift(prefixDeclaration);
      }
      
      const updatedQuery = lines.join('\n');
      setQuery(updatedQuery);
      setLineCount((updatedQuery.match(/\n/g) || []).length + 1);
    }
  };

  // Format the query
  const handleFormatQuery = () => {
    const formatted = formatSparqlQuery(query);
    setQuery(formatted);
    setLineCount((formatted.match(/\n/g) || []).length + 1);
  };

  // Add a basic query template if empty
  const addBasicStructure = () => {
    if (!query.trim()) {
      const basicQuery = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?subject ?predicate ?object
WHERE {
  ?subject ?predicate ?object .
  
  # Add your conditions here
  
} LIMIT 100`;
      
      setQuery(basicQuery);
      setLineCount((basicQuery.match(/\n/g) || []).length + 1);
    }
  };
  
  // Add LIMIT if missing
  const addLimit = () => {
    if (!query.toUpperCase().includes('LIMIT')) {
      let updatedQuery = query.trim();
      updatedQuery += '\nLIMIT 100';
      setQuery(updatedQuery);
      setLineCount((updatedQuery.match(/\n/g) || []).length + 1);
    }
  };

  return (
    <Card>
      <Card.Header as="h5">SPARQL Editor</Card.Header>
      <Card.Body>
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>SPARQL Endpoint</Form.Label>
            <Form.Control
              type="text"
              placeholder="Enter SPARQL endpoint URL"
              value={sparqlEndpoint}
              onChange={(e) => setSparqlEndpoint(e.target.value)}
              list="endpointSuggestions"
            />
            <datalist id="endpointSuggestions">
              {endpointSuggestions.map((endpoint, index) => (
                <option key={index} value={endpoint.url} label={endpoint.description} />
              ))}
            </datalist>
            <Form.Text className="text-muted">
              Example: https://dbpedia.org/sparql or https://data.europa.eu/a4g/sparql
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Query Templates</Form.Label>
            <Form.Select onChange={handleTemplateChange}>
              {Object.keys(queryTemplates).map((template) => (
                <option key={template} value={template}>
                  {template}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Common Prefixes</Form.Label>
            <div className="d-flex flex-wrap gap-1 mb-2">
              {commonPrefixes.map((prefixInfo, index) => (
                <OverlayTrigger
                  key={index}
                  placement="top"
                  overlay={<Tooltip>{prefixInfo.description}<br/>{prefixInfo.uri}</Tooltip>}
                >
                  <Button 
                    variant="outline-secondary" 
                    size="sm"
                    onClick={() => addPrefix(prefixInfo.prefix, prefixInfo.uri)}
                  >
                    {prefixInfo.prefix}
                  </Button>
                </OverlayTrigger>
              ))}
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>SPARQL Query</Form.Label>
            <div className="editor-container d-flex border rounded">
              <div className="line-numbers-container p-2 bg-light border-end">
                <LineNumbers lines={lineCount} />
              </div>
              <Form.Control
                ref={textareaRef}
                as="textarea"
                rows={10}
                placeholder="Enter your SPARQL query here..."
                value={query}
                onChange={handleQueryChange}
                className="border-0"
                style={{ resize: 'vertical', fontFamily: 'monospace' }}
              />
            </div>
            
            <Row className="mt-2">
              <Col>
                <Button 
                  variant="outline-secondary" 
                  size="sm"
                  onClick={handleFormatQuery}
                  className="me-2"
                >
                  Format Query
                </Button>
                <Button 
                  variant="outline-secondary" 
                  size="sm"
                  onClick={addBasicStructure}
                  className="me-2"
                >
                  Add Basic Structure
                </Button>
                <Button 
                  variant="outline-secondary" 
                  size="sm"
                  onClick={addLimit}
                >
                  Add LIMIT
                </Button>
              </Col>
            </Row>
            
            <Form.Text className="text-muted mt-2">
              Use the buttons above to format your query or add common structure elements.
            </Form.Text>
          </Form.Group>

          {!validationResult.valid && (
            <Alert variant="danger" className="mt-2">
              <strong>Error:</strong> {validationResult.error}
            </Alert>
          )}
          
          {validationResult.warnings && validationResult.warnings.length > 0 && (
            <Alert variant="warning" className="mt-2">
              <strong>Warnings:</strong>
              <ul className="mb-0">
                {validationResult.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Button 
            variant="primary" 
            onClick={handleExecuteQuery} 
            disabled={isLoading || !sparqlEndpoint}
            className="mt-3"
          >
            {isLoading ? 'Executing...' : 'Execute Query'}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
};

export default EnhancedSparqlEditor;
