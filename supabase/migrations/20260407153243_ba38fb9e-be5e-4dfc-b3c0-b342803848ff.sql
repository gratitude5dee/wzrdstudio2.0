UPDATE ai_model_catalog 
SET ui_group = 'generation' 
WHERE provider = 'gmi-cloud' 
  AND media_type = 'image' 
  AND ui_group = 'advanced';